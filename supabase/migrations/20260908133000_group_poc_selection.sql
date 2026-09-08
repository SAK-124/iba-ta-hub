-- Give TA-created groups an explicit student POC while keeping the existing
-- creator columns and student permission checks backward compatible.
-- This migration is intentionally not applied here.

BEGIN;

CREATE OR REPLACE FUNCTION public.reassign_group_creator_if_needed(
  p_group_id uuid,
  p_removed_student_erp text,
  p_actor_email text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_group public.student_groups%ROWTYPE;
  v_replacement_erp text;
BEGIN
  SELECT * INTO v_group
  FROM public.student_groups
  WHERE id = p_group_id
  FOR UPDATE;

  IF NOT FOUND OR v_group.created_by_erp IS DISTINCT FROM p_removed_student_erp THEN
    RETURN;
  END IF;

  SELECT roster.erp INTO v_replacement_erp
  FROM public.student_group_members gm
  JOIN public.students_roster roster ON roster.erp = gm.student_erp
  WHERE gm.group_id = p_group_id
    AND gm.student_erp IS DISTINCT FROM p_removed_student_erp
  ORDER BY roster.class_no, roster.student_name, roster.erp
  LIMIT 1;

  IF v_replacement_erp IS NOT NULL THEN
    UPDATE public.student_groups
    SET created_by_erp = v_replacement_erp,
        updated_at = now()
    WHERE id = p_group_id;
  ELSE
    UPDATE public.student_groups
    SET created_by_erp = NULL,
        created_by_role = 'ta',
        created_by_email = p_actor_email,
        updated_at = now()
    WHERE id = p_group_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_group_creator_if_needed(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reassign_group_creator_if_needed(uuid, text, text) TO authenticated;

-- Keep the persisted POC aligned with membership when the current POC leaves.
-- The legacy function only protected student-created groups and did not invoke
-- the reassignment helper, which left TA-created POCs pointing at nonmembers.
CREATE OR REPLACE FUNCTION public.student_leave_group()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_erp text;
  v_actor_email text;
  v_group public.student_groups%ROWTYPE;
  v_group_member_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_actor_erp := public.current_student_erp_from_auth();
  IF v_actor_erp IS NULL THEN
    RAISE EXCEPTION 'Could not derive ERP from email';
  END IF;
  v_actor_email := auth.jwt() ->> 'email';

  PERFORM pg_advisory_xact_lock(hashtext('student-group-member:' || v_actor_erp));

  SELECT groups.*
  INTO v_group
  FROM public.student_group_members gm
  JOIN public.student_groups groups
    ON groups.id = gm.group_id
  WHERE gm.student_erp = v_actor_erp
  FOR UPDATE OF groups, gm;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not assigned to a group';
  END IF;

  IF now() > v_group.student_edit_locked_at THEN
    RAISE EXCEPTION 'This group is locked for student edits';
  END IF;

  SELECT COUNT(*)::integer
  INTO v_group_member_count
  FROM public.student_group_members
  WHERE group_id = v_group.id;

  IF v_group.created_by_role = 'student'
     AND v_group.created_by_erp IS NOT DISTINCT FROM v_actor_erp
     AND v_group_member_count > 1 THEN
    RAISE EXCEPTION 'Group creator cannot leave while other members remain';
  END IF;

  DELETE FROM public.student_group_members
  WHERE group_id = v_group.id
    AND student_erp = v_actor_erp;

  PERFORM public.reassign_group_creator_if_needed(v_group.id, v_actor_erp, v_actor_email);

  RETURN public.get_student_groups_state();
END;
$$;

REVOKE ALL ON FUNCTION public.student_leave_group() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_leave_group() TO authenticated;

-- New name avoids an ambiguous PostgREST overload of the legacy four-argument
-- ta_create_group function. The legacy function remains available to older
-- clients, while the portal uses this validated five-argument entry point.
CREATE OR REPLACE FUNCTION public.ta_create_group_with_poc(
  p_group_number integer,
  p_display_name text,
  p_student_erps text[],
  p_edit_deadline timestamptz,
  p_poc_erp text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_poc_erp text := NULLIF(btrim(p_poc_erp), '');
  v_distinct_student_erps text[];
  v_result jsonb;
BEGIN
  v_distinct_student_erps := ARRAY(
    SELECT DISTINCT btrim(value)
    FROM unnest(COALESCE(p_student_erps, ARRAY[]::text[])) AS value
    WHERE NULLIF(btrim(value), '') IS NOT NULL
  );

  IF v_poc_erp IS NULL OR NOT (v_poc_erp = ANY(v_distinct_student_erps)) THEN
    RAISE EXCEPTION 'Select exactly one POC from the group members';
  END IF;

  v_result := public.ta_create_group(
    p_group_number,
    p_display_name,
    p_student_erps,
    p_edit_deadline
  );

  UPDATE public.student_groups
  SET created_by_erp = v_poc_erp,
      updated_at = now()
  WHERE group_number = p_group_number
    AND created_by_role = 'ta'
    AND EXISTS (
      SELECT 1 FROM public.student_group_members gm
      WHERE gm.group_id = public.student_groups.id
        AND gm.student_erp = v_poc_erp
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected POC is not a member of Group %', p_group_number;
  END IF;

  RETURN public.list_group_admin_state();
END;
$$;

REVOKE ALL ON FUNCTION public.ta_create_group_with_poc(integer, text, text[], timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ta_create_group_with_poc(integer, text, text[], timestamptz, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ta_set_group_poc(
  p_group_number integer,
  p_poc_erp text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ta_email text;
  v_poc_erp text := NULLIF(btrim(p_poc_erp), '');
  v_group_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_ta_email := auth.jwt() ->> 'email';
  IF NOT public.is_ta(v_ta_email) THEN
    RAISE EXCEPTION 'Only TAs can change group POCs';
  END IF;
  IF p_group_number IS NULL OR p_group_number < 1 OR v_poc_erp IS NULL THEN
    RAISE EXCEPTION 'Group number and POC ERP are required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('student-group-number:' || p_group_number::text));

  SELECT id INTO v_group_id
  FROM public.student_groups
  WHERE group_number = p_group_number
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group % does not exist', p_group_number;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.student_group_members
    WHERE group_id = v_group_id AND student_erp = v_poc_erp
  ) THEN
    RAISE EXCEPTION 'POC must be a current member of Group %', p_group_number;
  END IF;

  UPDATE public.student_groups
  SET created_by_erp = v_poc_erp,
      updated_at = now()
  WHERE id = v_group_id;

  RETURN public.list_group_admin_state();
END;
$$;

REVOKE ALL ON FUNCTION public.ta_set_group_poc(integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ta_set_group_poc(integer, text) TO authenticated;

-- A selected TA-created POC should have the same request-review capability as
-- a student-created group's original POC.
DROP POLICY IF EXISTS "Students and TAs can view group join requests" ON public.student_group_join_requests;
CREATE POLICY "Students and TAs can view group join requests"
  ON public.student_group_join_requests FOR SELECT
  USING (
    student_erp = public.current_student_erp_from_auth()
    OR public.is_ta(auth.jwt() ->> 'email')
    OR EXISTS (
      SELECT 1 FROM public.student_groups g
      WHERE g.id = group_id
        AND g.created_by_erp = public.current_student_erp_from_auth()
    )
  );

CREATE OR REPLACE FUNCTION public.get_student_groups_state()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email text;
  v_erp text;
  v_current_group_id uuid;
  v_groups jsonb := '[]'::jsonb;
  v_roster jsonb := '[]'::jsonb;
  v_my_request jsonb := NULL;
  v_incoming jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  v_email := auth.jwt() ->> 'email';
  v_erp := public.current_student_erp_from_auth();
  IF v_erp IS NULL THEN RAISE EXCEPTION 'Could not derive ERP from email'; END IF;

  SELECT group_id INTO v_current_group_id FROM public.student_group_members WHERE student_erp = v_erp;
  SELECT public.group_join_request_payload(r.id) INTO v_my_request
  FROM public.student_group_join_requests r
  WHERE r.student_erp = v_erp AND r.status = 'pending'
  ORDER BY r.created_at DESC LIMIT 1;

  SELECT COALESCE(jsonb_agg(public.group_join_request_payload(r.id) ORDER BY r.created_at), '[]'::jsonb)
    INTO v_incoming
  FROM public.student_group_join_requests r
  JOIN public.student_groups g ON g.id = r.group_id
  WHERE r.status = 'pending' AND g.created_by_erp = v_erp;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', g.id, 'group_number', g.group_number, 'display_name', g.display_name,
    'created_by_erp', g.created_by_erp, 'created_by_email', g.created_by_email,
    'created_by_role', g.created_by_role, 'student_edit_locked_at', g.student_edit_locked_at,
    'created_at', g.created_at, 'updated_at', g.updated_at, 'is_locked', now() > g.student_edit_locked_at,
    'member_count', COALESCE(mc.member_count, 0), 'members', COALESCE(mp.members, '[]'::jsonb)
  ) ORDER BY g.group_number), '[]'::jsonb) INTO v_groups
  FROM public.student_groups g
  LEFT JOIN (SELECT group_id, COUNT(*)::integer member_count FROM public.student_group_members GROUP BY group_id) mc ON mc.group_id = g.id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('erp', roster.erp, 'student_name', roster.student_name, 'class_no', roster.class_no)
      ORDER BY roster.class_no, roster.student_name) members
    FROM public.student_group_members gm JOIN public.students_roster roster ON roster.erp = gm.student_erp
    WHERE gm.group_id = g.id
  ) mp ON true;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'erp', roster.erp, 'student_name', roster.student_name, 'class_no', roster.class_no, 'group_number', g.group_number
  ) ORDER BY roster.class_no, roster.student_name), '[]'::jsonb) INTO v_roster
  FROM public.students_roster roster
  LEFT JOIN public.student_group_members gm ON gm.student_erp = roster.erp
  LEFT JOIN public.student_groups g ON g.id = gm.group_id;

  RETURN jsonb_build_object('student_email', v_email, 'student_erp', v_erp, 'current_group_id', v_current_group_id,
    'groups', v_groups, 'roster', v_roster, 'my_join_request', v_my_request, 'incoming_join_requests', v_incoming);
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_to_group_join_request(p_request_id uuid, p_accept boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email text; v_actor_erp text; v_request public.student_group_join_requests%ROWTYPE; v_group public.student_groups%ROWTYPE; v_count integer;
  v_is_ta boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  v_email := auth.jwt() ->> 'email'; v_actor_erp := public.current_student_erp_from_auth(); v_is_ta := public.is_ta(v_email);
  SELECT r.* INTO v_request FROM public.student_group_join_requests r WHERE r.id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.status <> 'pending' THEN RAISE EXCEPTION 'Pending group request not found'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('student-group-number:' || v_request.group_id::text));
  SELECT * INTO v_group FROM public.student_groups WHERE id = v_request.group_id FOR UPDATE;
  IF NOT v_is_ta AND v_group.created_by_erp IS DISTINCT FROM v_actor_erp THEN
    RAISE EXCEPTION 'Only the group POC or a TA can respond to requests';
  END IF;
  IF p_accept AND NOT v_is_ta AND now() > v_group.student_edit_locked_at THEN
    RAISE EXCEPTION 'Group % is locked for student edits', v_group.group_number;
  END IF;
  IF p_accept THEN
    PERFORM pg_advisory_xact_lock(hashtext('student-group-member:' || v_request.student_erp));
    IF EXISTS (SELECT 1 FROM public.student_group_members WHERE student_erp = v_request.student_erp) THEN RAISE EXCEPTION 'Student is already assigned to a group'; END IF;
    SELECT COUNT(*)::integer INTO v_count FROM public.student_group_members WHERE group_id = v_group.id;
    IF v_count >= 5 THEN RAISE EXCEPTION 'Group % is already full', v_group.group_number; END IF;
    UPDATE public.student_group_join_requests SET status = 'accepted', responded_at = now(), responded_by_email = v_email WHERE id = p_request_id;
    INSERT INTO public.student_group_members(group_id, student_erp, added_by_erp, added_by_role)
      VALUES (v_group.id, v_request.student_erp, COALESCE(v_actor_erp, v_email), CASE WHEN v_is_ta THEN 'ta' ELSE 'student' END);
  ELSE
    UPDATE public.student_group_join_requests SET status = 'declined', responded_at = now(), responded_by_email = v_email WHERE id = p_request_id;
  END IF;
  IF v_is_ta THEN RETURN public.list_group_admin_state(); END IF;
  RETURN public.get_student_groups_state();
END;
$$;

COMMIT;
