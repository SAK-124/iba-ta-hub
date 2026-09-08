-- Group join requests.  Student requests are intentionally separate from
-- membership so a group's student leader cannot silently add classmates.
BEGIN;

CREATE TABLE IF NOT EXISTS public.student_group_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.student_groups(id) ON DELETE CASCADE,
  student_erp text NOT NULL REFERENCES public.students_roster(erp) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  responded_by_email text
);

CREATE UNIQUE INDEX IF NOT EXISTS student_group_join_requests_one_pending_student
  ON public.student_group_join_requests(student_erp)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS student_group_join_requests_group_pending
  ON public.student_group_join_requests(group_id, created_at)
  WHERE status = 'pending';

ALTER TABLE public.student_group_join_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Students and TAs can view group join requests" ON public.student_group_join_requests;
CREATE POLICY "Students and TAs can view group join requests"
  ON public.student_group_join_requests FOR SELECT
  USING (
    student_erp = public.current_student_erp_from_auth()
    OR public.is_ta(auth.jwt() ->> 'email')
    OR EXISTS (
      SELECT 1 FROM public.student_groups g
      WHERE g.id = group_id
        AND g.created_by_role = 'student'
        AND g.created_by_erp = public.current_student_erp_from_auth()
    )
  );

CREATE OR REPLACE FUNCTION public.group_join_request_payload(p_request_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', r.id,
    'group_id', r.group_id,
    'group_number', g.group_number,
    'student_erp', r.student_erp,
    'student_name', roster.student_name,
    'class_no', roster.class_no,
    'status', r.status,
    'created_at', r.created_at,
    'responded_at', r.responded_at,
    'responded_by_email', r.responded_by_email
  )
  FROM public.student_group_join_requests r
  JOIN public.student_groups g ON g.id = r.group_id
  JOIN public.students_roster roster ON roster.erp = r.student_erp
  WHERE r.id = p_request_id;
$$;

REVOKE ALL ON FUNCTION public.group_join_request_payload(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.group_join_request_payload(uuid) FROM authenticated;

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
  WHERE r.status = 'pending' AND g.created_by_role = 'student' AND g.created_by_erp = v_erp;

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

CREATE OR REPLACE FUNCTION public.list_group_admin_state()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email text;
  v_groups jsonb := '[]'::jsonb;
  v_roster jsonb := '[]'::jsonb;
  v_requests jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  v_email := auth.jwt() ->> 'email';
  IF NOT public.is_ta(v_email) THEN RAISE EXCEPTION 'Only TAs can access group admin state'; END IF;

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

  SELECT COALESCE(jsonb_agg(public.group_join_request_payload(r.id) ORDER BY r.created_at), '[]'::jsonb)
    INTO v_requests FROM public.student_group_join_requests r WHERE r.status = 'pending';

  RETURN jsonb_build_object('viewer_email', v_email, 'groups', v_groups, 'roster', v_roster, 'join_requests', v_requests);
END;
$$;

CREATE OR REPLACE FUNCTION public.student_request_group_join(p_group_number integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_erp text; v_group public.student_groups%ROWTYPE; v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_group_number IS NULL OR p_group_number < 1 THEN RAISE EXCEPTION 'Group number must be a positive integer'; END IF;
  v_erp := public.current_student_erp_from_auth();
  IF v_erp IS NULL THEN RAISE EXCEPTION 'Could not derive ERP from email'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('student-group-member:' || v_erp));
  PERFORM pg_advisory_xact_lock(hashtext('student-group-number:' || p_group_number::text));
  IF NOT EXISTS (SELECT 1 FROM public.students_roster WHERE erp = v_erp) THEN RAISE EXCEPTION 'Student ERP not found in roster'; END IF;
  IF EXISTS (SELECT 1 FROM public.student_group_members WHERE student_erp = v_erp) THEN RAISE EXCEPTION 'You are already assigned to a group'; END IF;
  IF EXISTS (SELECT 1 FROM public.student_group_join_requests WHERE student_erp = v_erp AND status = 'pending') THEN RAISE EXCEPTION 'You already have a pending group request'; END IF;
  SELECT * INTO v_group FROM public.student_groups WHERE group_number = p_group_number FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Group % does not exist', p_group_number; END IF;
  IF now() > v_group.student_edit_locked_at THEN RAISE EXCEPTION 'Group % is locked for student edits', p_group_number; END IF;
  SELECT COUNT(*)::integer INTO v_count FROM public.student_group_members WHERE group_id = v_group.id;
  IF v_count >= 5 THEN RAISE EXCEPTION 'Group % is already full', p_group_number; END IF;
  INSERT INTO public.student_group_join_requests(group_id, student_erp) VALUES (v_group.id, v_erp);
  RETURN public.get_student_groups_state();
END;
$$;

CREATE OR REPLACE FUNCTION public.student_join_group(p_group_number integer)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT public.student_request_group_join(p_group_number); $$;

-- A TA assignment or removal supersedes any pending self-service request.
-- Approved requests are inserted as student-created membership and therefore
-- remain accepted until the response function records their final status.
CREATE OR REPLACE FUNCTION public.cancel_group_requests_after_ta_membership_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_student_erp text;
  v_should_cancel boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_student_erp := OLD.student_erp;
    v_should_cancel := true;
  ELSIF TG_OP = 'INSERT' THEN
    v_student_erp := NEW.student_erp;
    v_should_cancel := true;
  ELSE
    v_student_erp := NEW.student_erp;
    v_should_cancel := NEW.added_by_role = 'ta';
  END IF;
  IF v_should_cancel THEN
    UPDATE public.student_group_join_requests
    SET status = 'cancelled', responded_at = now(), responded_by_email = COALESCE(auth.jwt() ->> 'email', 'system')
    WHERE student_erp = v_student_erp AND status = 'pending';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS cancel_group_requests_after_ta_membership_change ON public.student_group_members;
CREATE TRIGGER cancel_group_requests_after_ta_membership_change
  AFTER INSERT OR UPDATE OR DELETE ON public.student_group_members
  FOR EACH ROW EXECUTE FUNCTION public.cancel_group_requests_after_ta_membership_change();

-- Kept as a compatibility stub for older clients.  Membership can now only
-- be created by an approved request or a TA assignment.
CREATE OR REPLACE FUNCTION public.student_add_group_member(p_group_number integer, p_student_erp text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Students cannot directly add members; ask the student to request to join';
END;
$$;

CREATE OR REPLACE FUNCTION public.student_cancel_group_join_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_erp text; v_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  v_erp := public.current_student_erp_from_auth();
  PERFORM pg_advisory_xact_lock(hashtext('student-group-member:' || v_erp));
  SELECT status INTO v_status FROM public.student_group_join_requests WHERE id = p_request_id AND student_erp = v_erp FOR UPDATE;
  IF NOT FOUND OR v_status <> 'pending' THEN RAISE EXCEPTION 'Pending group request not found'; END IF;
  UPDATE public.student_group_join_requests SET status = 'cancelled', responded_at = now(), responded_by_email = auth.jwt() ->> 'email' WHERE id = p_request_id;
  RETURN public.get_student_groups_state();
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
  IF NOT v_is_ta AND (v_group.created_by_role <> 'student' OR v_group.created_by_erp IS DISTINCT FROM v_actor_erp) THEN
    RAISE EXCEPTION 'Only the group creator or a TA can respond to requests';
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

REVOKE ALL ON FUNCTION public.student_request_group_join(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_request_group_join(integer) TO authenticated;
REVOKE ALL ON FUNCTION public.student_join_group(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_join_group(integer) TO authenticated;
REVOKE ALL ON FUNCTION public.student_cancel_group_join_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_cancel_group_join_request(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.respond_to_group_join_request(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_group_join_request(uuid, boolean) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'student_group_join_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.student_group_join_requests;
  END IF;
END
$$;

COMMIT;
