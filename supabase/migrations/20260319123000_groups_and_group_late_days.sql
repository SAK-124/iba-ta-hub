-- Course groups and group-aware late-day claims.
-- Adds:
-- - course-wide numbered student groups
-- - student/TA RPCs for managing groups
-- - ERP-based late-day ownership
-- - grouped late-day claim batches
-- - TA-triggered manual recompute for historical grouped claims

CREATE TABLE IF NOT EXISTS public.student_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_number integer NOT NULL UNIQUE CHECK (group_number > 0),
  created_by_erp text,
  created_by_email text NOT NULL,
  created_by_role text NOT NULL DEFAULT 'student' CHECK (created_by_role IN ('student', 'ta')),
  student_edit_locked_at timestamptz NOT NULL DEFAULT (now() + interval '3 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.student_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.student_groups(id) ON DELETE CASCADE,
  student_erp text NOT NULL REFERENCES public.students_roster(erp) ON DELETE CASCADE,
  added_by_erp text NOT NULL,
  added_by_role text NOT NULL CHECK (added_by_role IN ('student', 'ta')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, student_erp),
  UNIQUE(student_erp)
);

CREATE TABLE IF NOT EXISTS public.late_day_claim_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.late_day_assignments(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.student_groups(id) ON DELETE SET NULL,
  claimed_by_erp text NOT NULL,
  claimed_by_email text NOT NULL,
  days_used integer NOT NULL CHECK (days_used > 0),
  membership_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  recomputed_at timestamptz,
  recomputed_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.late_day_claims
  ADD COLUMN IF NOT EXISTS claim_batch_id uuid REFERENCES public.late_day_claim_batches(id) ON DELETE SET NULL;

ALTER TABLE public.late_day_claims
  ADD COLUMN IF NOT EXISTS claimed_by_erp text;

ALTER TABLE public.late_day_claims
  ADD COLUMN IF NOT EXISTS claimed_by_email text;

ALTER TABLE public.late_day_claims
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.student_groups(id) ON DELETE SET NULL;

ALTER TABLE public.late_day_claims
  ADD COLUMN IF NOT EXISTS claim_role text NOT NULL DEFAULT 'self';

ALTER TABLE public.late_day_claims
  DROP CONSTRAINT IF EXISTS late_day_claims_claim_role_check;

ALTER TABLE public.late_day_claims
  ADD CONSTRAINT late_day_claims_claim_role_check CHECK (claim_role IN ('self', 'initiator', 'group_member'));

UPDATE public.late_day_claims
SET
  claimed_by_erp = COALESCE(claimed_by_erp, student_erp),
  claimed_by_email = COALESCE(claimed_by_email, student_email),
  claim_role = COALESCE(NULLIF(claim_role, ''), 'self');

ALTER TABLE public.late_day_claims
  ALTER COLUMN claimed_by_erp SET NOT NULL;

ALTER TABLE public.late_day_claims
  ALTER COLUMN claimed_by_email SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_student_group_members_group
  ON public.student_group_members(group_id);

CREATE INDEX IF NOT EXISTS idx_student_group_members_student
  ON public.student_group_members(student_erp);

CREATE INDEX IF NOT EXISTS idx_late_day_claims_student_erp_claimed_desc
  ON public.late_day_claims(student_erp, claimed_at DESC);

CREATE INDEX IF NOT EXISTS idx_late_day_claims_batch
  ON public.late_day_claims(claim_batch_id);

CREATE INDEX IF NOT EXISTS idx_late_day_claims_group_assignment
  ON public.late_day_claims(group_id, assignment_id, claimed_at DESC);

CREATE INDEX IF NOT EXISTS idx_late_day_claim_batches_group_claimed_desc
  ON public.late_day_claim_batches(group_id, claimed_at DESC);

CREATE OR REPLACE FUNCTION public.current_student_erp_from_auth()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_erp text;
BEGIN
  v_erp := substring(auth.jwt() ->> 'email' FROM '(\d{5})@');
  RETURN NULLIF(v_erp, '');
END;
$$;

REVOKE ALL ON FUNCTION public.current_student_erp_from_auth() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_student_erp_from_auth() TO authenticated;

ALTER TABLE public.student_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.late_day_claim_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view student groups" ON public.student_groups;
CREATE POLICY "Authenticated users can view student groups"
  ON public.student_groups
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "TAs can manage student groups" ON public.student_groups;
CREATE POLICY "TAs can manage student groups"
  ON public.student_groups
  FOR ALL
  USING (public.is_ta(auth.jwt() ->> 'email'))
  WITH CHECK (public.is_ta(auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "Authenticated users can view group memberships" ON public.student_group_members;
CREATE POLICY "Authenticated users can view group memberships"
  ON public.student_group_members
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "TAs can manage group memberships" ON public.student_group_members;
CREATE POLICY "TAs can manage group memberships"
  ON public.student_group_members
  FOR ALL
  USING (public.is_ta(auth.jwt() ->> 'email'))
  WITH CHECK (public.is_ta(auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "TAs can view late day claim batches" ON public.late_day_claim_batches;
CREATE POLICY "TAs can view late day claim batches"
  ON public.late_day_claim_batches
  FOR SELECT
  USING (public.is_ta(auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "Students can view their own late day claim batches" ON public.late_day_claim_batches;
CREATE POLICY "Students can view their own late day claim batches"
  ON public.late_day_claim_batches
  FOR SELECT
  USING (
    claimed_by_erp = public.current_student_erp_from_auth()
    OR EXISTS (
      SELECT 1
      FROM public.student_group_members gm
      WHERE gm.group_id = late_day_claim_batches.group_id
        AND gm.student_erp = public.current_student_erp_from_auth()
    )
  );

DROP POLICY IF EXISTS "Students can view their own late day claims" ON public.late_day_claims;
DROP POLICY IF EXISTS "Students can view their own late-day claims by ERP" ON public.late_day_claims;
CREATE POLICY "Students can view their own late-day claims by ERP"
  ON public.late_day_claims
  FOR SELECT
  USING (student_erp = public.current_student_erp_from_auth());

DROP TRIGGER IF EXISTS update_student_groups_updated_at ON public.student_groups;
CREATE TRIGGER update_student_groups_updated_at
  BEFORE UPDATE ON public.student_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_student_group_members_updated_at ON public.student_group_members;
CREATE TRIGGER update_student_group_members_updated_at
  BEFORE UPDATE ON public.student_group_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.reassign_group_creator_if_needed(
  p_group_id uuid,
  p_removed_student_erp text,
  p_actor_email text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group public.student_groups%ROWTYPE;
  v_remaining integer := 0;
BEGIN
  SELECT *
  INTO v_group
  FROM public.student_groups
  WHERE id = p_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_group.created_by_role <> 'student' OR v_group.created_by_erp IS DISTINCT FROM p_removed_student_erp THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_remaining
  FROM public.student_group_members
  WHERE group_id = p_group_id;

  IF v_remaining > 0 THEN
    UPDATE public.student_groups
    SET
      created_by_role = 'ta',
      created_by_erp = NULL,
      created_by_email = p_actor_email,
      updated_at = now()
    WHERE id = p_group_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_group_creator_if_needed(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reassign_group_creator_if_needed(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_student_groups_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_student_erp text;
  v_current_group_id uuid;
  v_groups jsonb := '[]'::jsonb;
  v_roster jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_email := auth.jwt() ->> 'email';
  v_student_erp := public.current_student_erp_from_auth();

  IF v_student_erp IS NULL THEN
    RAISE EXCEPTION 'Could not derive ERP from email';
  END IF;

  SELECT gm.group_id
  INTO v_current_group_id
  FROM public.student_group_members gm
  WHERE gm.student_erp = v_student_erp;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', g.id,
        'group_number', g.group_number,
        'created_by_erp', g.created_by_erp,
        'created_by_email', g.created_by_email,
        'created_by_role', g.created_by_role,
        'student_edit_locked_at', g.student_edit_locked_at,
        'created_at', g.created_at,
        'updated_at', g.updated_at,
        'is_locked', now() > g.student_edit_locked_at,
        'member_count', COALESCE(member_counts.member_count, 0),
        'members', COALESCE(member_payload.members, '[]'::jsonb)
      )
      ORDER BY g.group_number
    ),
    '[]'::jsonb
  )
  INTO v_groups
  FROM public.student_groups g
  LEFT JOIN (
    SELECT group_id, COUNT(*)::integer AS member_count
    FROM public.student_group_members
    GROUP BY group_id
  ) member_counts ON member_counts.group_id = g.id
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'erp', roster.erp,
          'student_name', roster.student_name,
          'class_no', roster.class_no
        )
        ORDER BY roster.class_no, roster.student_name
      ),
      '[]'::jsonb
    ) AS members
    FROM public.student_group_members gm
    JOIN public.students_roster roster
      ON roster.erp = gm.student_erp
    WHERE gm.group_id = g.id
  ) member_payload ON true;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'erp', roster.erp,
        'student_name', roster.student_name,
        'class_no', roster.class_no,
        'group_number', groups.group_number
      )
      ORDER BY roster.class_no, roster.student_name
    ),
    '[]'::jsonb
  )
  INTO v_roster
  FROM public.students_roster roster
  LEFT JOIN public.student_group_members gm
    ON gm.student_erp = roster.erp
  LEFT JOIN public.student_groups groups
    ON groups.id = gm.group_id;

  RETURN jsonb_build_object(
    'student_email', v_email,
    'student_erp', v_student_erp,
    'current_group_id', v_current_group_id,
    'groups', v_groups,
    'roster', v_roster
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_groups_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_groups_state() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_group_admin_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ta_email text;
  v_groups jsonb := '[]'::jsonb;
  v_roster jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_ta_email := auth.jwt() ->> 'email';
  IF NOT public.is_ta(v_ta_email) THEN
    RAISE EXCEPTION 'Only TAs can access group admin state';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', g.id,
        'group_number', g.group_number,
        'created_by_erp', g.created_by_erp,
        'created_by_email', g.created_by_email,
        'created_by_role', g.created_by_role,
        'student_edit_locked_at', g.student_edit_locked_at,
        'created_at', g.created_at,
        'updated_at', g.updated_at,
        'is_locked', now() > g.student_edit_locked_at,
        'member_count', COALESCE(member_counts.member_count, 0),
        'members', COALESCE(member_payload.members, '[]'::jsonb)
      )
      ORDER BY g.group_number
    ),
    '[]'::jsonb
  )
  INTO v_groups
  FROM public.student_groups g
  LEFT JOIN (
    SELECT group_id, COUNT(*)::integer AS member_count
    FROM public.student_group_members
    GROUP BY group_id
  ) member_counts ON member_counts.group_id = g.id
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'erp', roster.erp,
          'student_name', roster.student_name,
          'class_no', roster.class_no
        )
        ORDER BY roster.class_no, roster.student_name
      ),
      '[]'::jsonb
    ) AS members
    FROM public.student_group_members gm
    JOIN public.students_roster roster
      ON roster.erp = gm.student_erp
    WHERE gm.group_id = g.id
  ) member_payload ON true;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'erp', roster.erp,
        'student_name', roster.student_name,
        'class_no', roster.class_no,
        'group_number', groups.group_number
      )
      ORDER BY roster.class_no, roster.student_name
    ),
    '[]'::jsonb
  )
  INTO v_roster
  FROM public.students_roster roster
  LEFT JOIN public.student_group_members gm
    ON gm.student_erp = roster.erp
  LEFT JOIN public.student_groups groups
    ON groups.id = gm.group_id;

  RETURN jsonb_build_object(
    'viewer_email', v_ta_email,
    'groups', v_groups,
    'roster', v_roster
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_group_admin_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_group_admin_state() TO authenticated;

CREATE OR REPLACE FUNCTION public.student_create_group(p_group_number integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_student_erp text;
  v_group_id uuid;
  v_exists boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_group_number IS NULL OR p_group_number < 1 THEN
    RAISE EXCEPTION 'Group number must be a positive integer';
  END IF;

  v_email := auth.jwt() ->> 'email';
  v_student_erp := public.current_student_erp_from_auth();

  IF v_student_erp IS NULL THEN
    RAISE EXCEPTION 'Could not derive ERP from email';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('student-group-member:' || v_student_erp));
  PERFORM pg_advisory_xact_lock(hashtext('student-group-number:' || p_group_number::text));

  SELECT EXISTS(
    SELECT 1
    FROM public.students_roster
    WHERE erp = v_student_erp
  )
  INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'Student ERP not found in roster';
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM public.student_group_members
    WHERE student_erp = v_student_erp
  )
  INTO v_exists;

  IF v_exists THEN
    RAISE EXCEPTION 'You are already assigned to a group';
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM public.student_groups
    WHERE group_number = p_group_number
  )
  INTO v_exists;

  IF v_exists THEN
    RAISE EXCEPTION 'Group % already exists. Join it instead.', p_group_number;
  END IF;

  INSERT INTO public.student_groups (
    group_number,
    created_by_erp,
    created_by_email,
    created_by_role,
    student_edit_locked_at
  )
  VALUES (
    p_group_number,
    v_student_erp,
    v_email,
    'student',
    now() + interval '3 days'
  )
  RETURNING id
  INTO v_group_id;

  INSERT INTO public.student_group_members (
    group_id,
    student_erp,
    added_by_erp,
    added_by_role
  )
  VALUES (
    v_group_id,
    v_student_erp,
    v_student_erp,
    'student'
  );

  RETURN public.get_student_groups_state();
END;
$$;

REVOKE ALL ON FUNCTION public.student_create_group(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_create_group(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.student_join_group(p_group_number integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_erp text;
  v_group public.student_groups%ROWTYPE;
  v_member_count integer := 0;
  v_exists boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_group_number IS NULL OR p_group_number < 1 THEN
    RAISE EXCEPTION 'Group number must be a positive integer';
  END IF;

  v_student_erp := public.current_student_erp_from_auth();
  IF v_student_erp IS NULL THEN
    RAISE EXCEPTION 'Could not derive ERP from email';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('student-group-member:' || v_student_erp));
  PERFORM pg_advisory_xact_lock(hashtext('student-group-number:' || p_group_number::text));

  SELECT EXISTS(
    SELECT 1
    FROM public.students_roster
    WHERE erp = v_student_erp
  )
  INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'Student ERP not found in roster';
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM public.student_group_members
    WHERE student_erp = v_student_erp
  )
  INTO v_exists;

  IF v_exists THEN
    RAISE EXCEPTION 'You are already assigned to a group';
  END IF;

  SELECT *
  INTO v_group
  FROM public.student_groups
  WHERE group_number = p_group_number
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group % does not exist', p_group_number;
  END IF;

  IF now() > v_group.student_edit_locked_at THEN
    RAISE EXCEPTION 'Group % is locked for student edits', p_group_number;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_member_count
  FROM public.student_group_members
  WHERE group_id = v_group.id;

  IF v_member_count >= 5 THEN
    RAISE EXCEPTION 'Group % is already full', p_group_number;
  END IF;

  INSERT INTO public.student_group_members (
    group_id,
    student_erp,
    added_by_erp,
    added_by_role
  )
  VALUES (
    v_group.id,
    v_student_erp,
    v_student_erp,
    'student'
  );

  RETURN public.get_student_groups_state();
END;
$$;

REVOKE ALL ON FUNCTION public.student_join_group(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_join_group(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.student_add_group_member(p_group_number integer, p_student_erp text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_erp text;
  v_group public.student_groups%ROWTYPE;
  v_member_count integer := 0;
  v_exists boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_group_number IS NULL OR p_group_number < 1 THEN
    RAISE EXCEPTION 'Group number must be a positive integer';
  END IF;

  IF p_student_erp IS NULL OR btrim(p_student_erp) = '' THEN
    RAISE EXCEPTION 'Student ERP is required';
  END IF;

  v_actor_erp := public.current_student_erp_from_auth();
  IF v_actor_erp IS NULL THEN
    RAISE EXCEPTION 'Could not derive ERP from email';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('student-group-member:' || v_actor_erp));
  PERFORM pg_advisory_xact_lock(hashtext('student-group-member:' || p_student_erp));
  PERFORM pg_advisory_xact_lock(hashtext('student-group-number:' || p_group_number::text));

  SELECT *
  INTO v_group
  FROM public.student_groups
  WHERE group_number = p_group_number
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group % does not exist', p_group_number;
  END IF;

  IF v_group.created_by_role <> 'student' OR v_group.created_by_erp IS DISTINCT FROM v_actor_erp THEN
    RAISE EXCEPTION 'Only the group creator can add members';
  END IF;

  IF now() > v_group.student_edit_locked_at THEN
    RAISE EXCEPTION 'Group % is locked for student edits', p_group_number;
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM public.students_roster
    WHERE erp = p_student_erp
  )
  INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'Student ERP not found in roster';
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM public.student_group_members
    WHERE student_erp = p_student_erp
  )
  INTO v_exists;

  IF v_exists THEN
    RAISE EXCEPTION 'Student % is already assigned to a group', p_student_erp;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_member_count
  FROM public.student_group_members
  WHERE group_id = v_group.id;

  IF v_member_count >= 5 THEN
    RAISE EXCEPTION 'Group % is already full', p_group_number;
  END IF;

  INSERT INTO public.student_group_members (
    group_id,
    student_erp,
    added_by_erp,
    added_by_role
  )
  VALUES (
    v_group.id,
    p_student_erp,
    v_actor_erp,
    'student'
  );

  RETURN public.get_student_groups_state();
END;
$$;

REVOKE ALL ON FUNCTION public.student_add_group_member(integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_add_group_member(integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.student_remove_group_member(p_group_number integer, p_student_erp text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_erp text;
  v_group public.student_groups%ROWTYPE;
  v_group_member_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_group_number IS NULL OR p_group_number < 1 THEN
    RAISE EXCEPTION 'Group number must be a positive integer';
  END IF;

  IF p_student_erp IS NULL OR btrim(p_student_erp) = '' THEN
    RAISE EXCEPTION 'Student ERP is required';
  END IF;

  v_actor_erp := public.current_student_erp_from_auth();
  IF v_actor_erp IS NULL THEN
    RAISE EXCEPTION 'Could not derive ERP from email';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('student-group-member:' || v_actor_erp));
  PERFORM pg_advisory_xact_lock(hashtext('student-group-member:' || p_student_erp));
  PERFORM pg_advisory_xact_lock(hashtext('student-group-number:' || p_group_number::text));

  SELECT *
  INTO v_group
  FROM public.student_groups
  WHERE group_number = p_group_number
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group % does not exist', p_group_number;
  END IF;

  IF v_group.created_by_role <> 'student' OR v_group.created_by_erp IS DISTINCT FROM v_actor_erp THEN
    RAISE EXCEPTION 'Only the group creator can remove members';
  END IF;

  IF now() > v_group.student_edit_locked_at THEN
    RAISE EXCEPTION 'Group % is locked for student edits', p_group_number;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_group_member_count
  FROM public.student_group_members
  WHERE group_id = v_group.id;

  IF p_student_erp = v_actor_erp AND v_group_member_count > 1 THEN
    RAISE EXCEPTION 'Group creator cannot leave while other members remain';
  END IF;

  DELETE FROM public.student_group_members
  WHERE group_id = v_group.id
    AND student_erp = p_student_erp;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student % is not assigned to group %', p_student_erp, p_group_number;
  END IF;

  RETURN public.get_student_groups_state();
END;
$$;

REVOKE ALL ON FUNCTION public.student_remove_group_member(integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_remove_group_member(integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.student_leave_group()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_erp text;
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

  IF v_group.created_by_role = 'student' AND v_group.created_by_erp IS NOT DISTINCT FROM v_actor_erp AND v_group_member_count > 1 THEN
    RAISE EXCEPTION 'Group creator cannot leave while other members remain';
  END IF;

  DELETE FROM public.student_group_members
  WHERE group_id = v_group.id
    AND student_erp = v_actor_erp;

  RETURN public.get_student_groups_state();
END;
$$;

REVOKE ALL ON FUNCTION public.student_leave_group() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_leave_group() TO authenticated;

CREATE OR REPLACE FUNCTION public.ta_set_student_group(p_student_erp text, p_group_number integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ta_email text;
  v_target_group public.student_groups%ROWTYPE;
  v_existing_group_id uuid;
  v_existing_group public.student_groups%ROWTYPE;
  v_member_count integer := 0;
  v_exists boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_ta_email := auth.jwt() ->> 'email';
  IF NOT public.is_ta(v_ta_email) THEN
    RAISE EXCEPTION 'Only TAs can change student groups';
  END IF;

  IF p_student_erp IS NULL OR btrim(p_student_erp) = '' THEN
    RAISE EXCEPTION 'Student ERP is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('student-group-member:' || p_student_erp));

  SELECT EXISTS(
    SELECT 1
    FROM public.students_roster
    WHERE erp = p_student_erp
  )
  INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'Student ERP not found in roster';
  END IF;

  SELECT gm.group_id
  INTO v_existing_group_id
  FROM public.student_group_members gm
  WHERE gm.student_erp = p_student_erp
  FOR UPDATE;

  IF v_existing_group_id IS NOT NULL THEN
    SELECT *
    INTO v_existing_group
    FROM public.student_groups
    WHERE id = v_existing_group_id
    FOR UPDATE;
  END IF;

  IF p_group_number IS NULL THEN
    DELETE FROM public.student_group_members
    WHERE student_erp = p_student_erp;

    IF v_existing_group_id IS NOT NULL THEN
      PERFORM public.reassign_group_creator_if_needed(v_existing_group_id, p_student_erp, v_ta_email);
    END IF;

    RETURN public.list_group_admin_state();
  END IF;

  IF p_group_number < 1 THEN
    RAISE EXCEPTION 'Group number must be a positive integer';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('student-group-number:' || p_group_number::text));

  SELECT *
  INTO v_target_group
  FROM public.student_groups
  WHERE group_number = p_group_number
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.student_groups (
      group_number,
      created_by_erp,
      created_by_email,
      created_by_role,
      student_edit_locked_at
    )
    VALUES (
      p_group_number,
      NULL,
      v_ta_email,
      'ta',
      now() + interval '3 days'
    )
    RETURNING *
    INTO v_target_group;
  END IF;

  IF v_existing_group_id IS NOT NULL AND v_existing_group_id <> v_target_group.id THEN
    DELETE FROM public.student_group_members
    WHERE student_erp = p_student_erp;

    PERFORM public.reassign_group_creator_if_needed(v_existing_group_id, p_student_erp, v_ta_email);
  END IF;

  SELECT COUNT(*)::integer
  INTO v_member_count
  FROM public.student_group_members
  WHERE group_id = v_target_group.id;

  IF v_existing_group_id IS DISTINCT FROM v_target_group.id AND v_member_count >= 5 THEN
    RAISE EXCEPTION 'Group % is already full', p_group_number;
  END IF;

  INSERT INTO public.student_group_members (
    group_id,
    student_erp,
    added_by_erp,
    added_by_role
  )
  VALUES (
    v_target_group.id,
    p_student_erp,
    p_student_erp,
    'ta'
  )
  ON CONFLICT (student_erp)
  DO UPDATE SET
    group_id = EXCLUDED.group_id,
    added_by_erp = EXCLUDED.added_by_erp,
    added_by_role = EXCLUDED.added_by_role,
    updated_at = now();

  RETURN public.list_group_admin_state();
END;
$$;

REVOKE ALL ON FUNCTION public.ta_set_student_group(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ta_set_student_group(text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_late_day_summary(p_student_erp text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester_email text;
  v_requester_erp text;
  v_target_erp text;
  v_used integer := 0;
  v_granted integer := 0;
  v_total_allowance integer := 3;
  v_group_number integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_requester_email := auth.jwt() ->> 'email';
  v_requester_erp := public.current_student_erp_from_auth();
  v_target_erp := COALESCE(NULLIF(btrim(p_student_erp), ''), v_requester_erp);

  IF v_target_erp IS NULL THEN
    RAISE EXCEPTION 'Student ERP is required';
  END IF;

  IF NOT public.is_ta(v_requester_email) AND v_target_erp IS DISTINCT FROM v_requester_erp THEN
    RAISE EXCEPTION 'You can only request your own late-day summary';
  END IF;

  SELECT COALESCE(SUM(days_used), 0)::integer
  INTO v_used
  FROM public.late_day_claims
  WHERE student_erp = v_target_erp;

  SELECT COALESCE(SUM(days_delta), 0)::integer
  INTO v_granted
  FROM public.late_day_adjustments
  WHERE student_erp = v_target_erp;

  SELECT groups.group_number
  INTO v_group_number
  FROM public.student_group_members gm
  JOIN public.student_groups groups
    ON groups.id = gm.group_id
  WHERE gm.student_erp = v_target_erp;

  v_total_allowance := 3 + v_granted;

  RETURN jsonb_build_object(
    'student_erp', v_target_erp,
    'group_number', v_group_number,
    'remaining', GREATEST(v_total_allowance - v_used, 0),
    'totalAllowance', v_total_allowance,
    'used', v_used,
    'granted', v_granted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_late_day_summary(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_late_day_summary(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_late_days(p_assignment_id uuid, p_days integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email text;
  v_student_erp text;
  v_group_id uuid;
  v_group_number integer;
  v_assignment_due_at timestamptz;
  v_latest_claim_deadline timestamptz;
  v_current_deadline timestamptz;
  v_new_deadline timestamptz;
  v_minimum_days_required integer := 1;
  v_bonus_days integer := 0;
  v_total_cap integer := 3;
  v_total_used integer := 0;
  v_member_erps text[] := ARRAY[]::text[];
  v_member_erp text;
  v_claim_record public.late_day_claims%ROWTYPE;
  v_requester_claim public.late_day_claims%ROWTYPE;
  v_batch_id uuid;
  v_now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_user_email := auth.jwt() ->> 'email';
  IF v_user_email IS NULL OR btrim(v_user_email) = '' THEN
    RAISE EXCEPTION 'Could not determine user email';
  END IF;

  v_student_erp := public.current_student_erp_from_auth();
  IF v_student_erp IS NULL THEN
    RAISE EXCEPTION 'Could not derive ERP from email';
  END IF;

  IF p_days IS NULL OR p_days < 1 THEN
    RAISE EXCEPTION 'p_days must be at least 1';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('student-group-member:' || v_student_erp));

  SELECT gm.group_id, groups.group_number
  INTO v_group_id, v_group_number
  FROM public.student_group_members gm
  JOIN public.student_groups groups
    ON groups.id = gm.group_id
  WHERE gm.student_erp = v_student_erp
  FOR UPDATE OF gm, groups;

  IF v_group_id IS NOT NULL THEN
    SELECT COALESCE(array_agg(student_erp ORDER BY student_erp), ARRAY[]::text[])
    INTO v_member_erps
    FROM public.student_group_members
    WHERE group_id = v_group_id;
  ELSE
    v_member_erps := ARRAY[v_student_erp];
  END IF;

  SELECT due_at
  INTO v_assignment_due_at
  FROM public.late_day_assignments
  WHERE id = p_assignment_id
    AND active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment not found or inactive';
  END IF;

  IF v_assignment_due_at IS NULL THEN
    RAISE EXCEPTION 'Deadline not set for this assignment yet';
  END IF;

  FOREACH v_member_erp IN ARRAY v_member_erps LOOP
    PERFORM pg_advisory_xact_lock(hashtext('student-group-member:' || v_member_erp));

    SELECT COALESCE(SUM(days_delta), 0)::integer
    INTO v_bonus_days
    FROM public.late_day_adjustments
    WHERE student_erp = v_member_erp;

    v_total_cap := 3 + v_bonus_days;

    IF p_days > v_total_cap THEN
      RAISE EXCEPTION 'Requested days exceed allowance for %', v_member_erp;
    END IF;

    SELECT COALESCE(SUM(days_used), 0)::integer
    INTO v_total_used
    FROM public.late_day_claims
    WHERE student_erp = v_member_erp;

    IF v_total_used + p_days > v_total_cap THEN
      RAISE EXCEPTION 'Late day cap exceeded for %. Remaining: %', v_member_erp, (v_total_cap - v_total_used);
    END IF;

    SELECT MAX(due_at_after_claim)
    INTO v_latest_claim_deadline
    FROM public.late_day_claims
    WHERE assignment_id = p_assignment_id
      AND student_erp = v_member_erp;

    v_current_deadline := GREATEST(
      v_assignment_due_at,
      COALESCE(v_latest_claim_deadline, v_assignment_due_at)
    );

    v_minimum_days_required := GREATEST(
      CEIL(EXTRACT(EPOCH FROM (v_now - v_current_deadline)) / 86400.0)::integer,
      1
    );

    IF p_days < v_minimum_days_required THEN
      RAISE EXCEPTION 'Need at least % late day(s) for % to cover the current lateness', v_minimum_days_required, v_member_erp;
    END IF;
  END LOOP;

  INSERT INTO public.late_day_claim_batches (
    assignment_id,
    group_id,
    claimed_by_erp,
    claimed_by_email,
    days_used,
    membership_snapshot,
    claimed_at
  )
  VALUES (
    p_assignment_id,
    v_group_id,
    v_student_erp,
    v_user_email,
    p_days,
    to_jsonb(v_member_erps),
    v_now
  )
  RETURNING id
  INTO v_batch_id;

  FOREACH v_member_erp IN ARRAY v_member_erps LOOP
    SELECT MAX(due_at_after_claim)
    INTO v_latest_claim_deadline
    FROM public.late_day_claims
    WHERE assignment_id = p_assignment_id
      AND student_erp = v_member_erp;

    v_current_deadline := GREATEST(
      v_assignment_due_at,
      COALESCE(v_latest_claim_deadline, v_assignment_due_at)
    );
    v_new_deadline := v_current_deadline + (p_days * interval '24 hours');

    INSERT INTO public.late_day_claims (
      assignment_id,
      student_email,
      student_erp,
      days_used,
      claimed_at,
      due_at_before_claim,
      due_at_after_claim,
      claim_batch_id,
      claimed_by_erp,
      claimed_by_email,
      group_id,
      claim_role
    )
    VALUES (
      p_assignment_id,
      v_user_email,
      v_member_erp,
      p_days,
      v_now,
      v_current_deadline,
      v_new_deadline,
      v_batch_id,
      v_student_erp,
      v_user_email,
      v_group_id,
      CASE
        WHEN v_group_id IS NULL THEN 'self'
        WHEN v_member_erp = v_student_erp THEN 'initiator'
        ELSE 'group_member'
      END
    )
    RETURNING *
    INTO v_claim_record;

    IF v_member_erp = v_student_erp THEN
      v_requester_claim := v_claim_record;
    END IF;
  END LOOP;

  SELECT COALESCE(SUM(days_delta), 0)::integer
  INTO v_bonus_days
  FROM public.late_day_adjustments
  WHERE student_erp = v_student_erp;

  SELECT COALESCE(SUM(days_used), 0)::integer
  INTO v_total_used
  FROM public.late_day_claims
  WHERE student_erp = v_student_erp;

  v_total_cap := 3 + v_bonus_days;

  RETURN jsonb_build_object(
    'claim', row_to_json(v_requester_claim),
    'claim_batch_id', v_batch_id,
    'group_number', v_group_number,
    'affected_students_count', cardinality(v_member_erps),
    'total_used', v_total_used,
    'total_allowance', v_total_cap,
    'remaining_late_days', GREATEST(v_total_cap - v_total_used, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ta_recompute_group_late_days(p_group_number integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ta_email text;
  v_group public.student_groups%ROWTYPE;
  v_member_erps text[] := ARRAY[]::text[];
  v_member_erp text;
  v_batch record;
  v_assignment_due_at timestamptz;
  v_latest_claim_deadline timestamptz;
  v_current_deadline timestamptz;
  v_new_deadline timestamptz;
  v_bonus_days integer := 0;
  v_total_cap integer := 3;
  v_total_used integer := 0;
  v_batch_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_ta_email := auth.jwt() ->> 'email';
  IF NOT public.is_ta(v_ta_email) THEN
    RAISE EXCEPTION 'Only TAs can recompute grouped late days';
  END IF;

  IF p_group_number IS NULL OR p_group_number < 1 THEN
    RAISE EXCEPTION 'Group number must be a positive integer';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('student-group-number:' || p_group_number::text));

  SELECT *
  INTO v_group
  FROM public.student_groups
  WHERE group_number = p_group_number
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group % does not exist', p_group_number;
  END IF;

  SELECT COALESCE(array_agg(student_erp ORDER BY student_erp), ARRAY[]::text[])
  INTO v_member_erps
  FROM public.student_group_members
  WHERE group_id = v_group.id;

  IF cardinality(v_member_erps) = 0 THEN
    RAISE EXCEPTION 'Group % has no members to recompute', p_group_number;
  END IF;

  FOREACH v_member_erp IN ARRAY v_member_erps LOOP
    PERFORM pg_advisory_xact_lock(hashtext('student-group-member:' || v_member_erp));
  END LOOP;

  SELECT COUNT(*)::integer
  INTO v_batch_count
  FROM public.late_day_claim_batches
  WHERE group_id = v_group.id;

  DELETE FROM public.late_day_claims
  WHERE claim_batch_id IN (
    SELECT id
    FROM public.late_day_claim_batches
    WHERE group_id = v_group.id
  );

  FOR v_batch IN
    SELECT *
    FROM public.late_day_claim_batches
    WHERE group_id = v_group.id
    ORDER BY claimed_at, created_at, id
  LOOP
    SELECT due_at
    INTO v_assignment_due_at
    FROM public.late_day_assignments
    WHERE id = v_batch.assignment_id;

    IF v_assignment_due_at IS NULL THEN
      RAISE EXCEPTION 'Assignment % must keep a deadline to recompute group late days', v_batch.assignment_id;
    END IF;

    FOREACH v_member_erp IN ARRAY v_member_erps LOOP
      SELECT COALESCE(SUM(days_delta), 0)::integer
      INTO v_bonus_days
      FROM public.late_day_adjustments
      WHERE student_erp = v_member_erp;

      SELECT COALESCE(SUM(days_used), 0)::integer
      INTO v_total_used
      FROM public.late_day_claims
      WHERE student_erp = v_member_erp;

      v_total_cap := 3 + v_bonus_days;

      IF v_total_used + v_batch.days_used > v_total_cap THEN
        RAISE EXCEPTION 'Cannot recompute group % because % would exceed the late-day allowance', p_group_number, v_member_erp;
      END IF;

      SELECT MAX(due_at_after_claim)
      INTO v_latest_claim_deadline
      FROM public.late_day_claims
      WHERE assignment_id = v_batch.assignment_id
        AND student_erp = v_member_erp;

      v_current_deadline := GREATEST(
        v_assignment_due_at,
        COALESCE(v_latest_claim_deadline, v_assignment_due_at)
      );
      v_new_deadline := v_current_deadline + (v_batch.days_used * interval '24 hours');

      INSERT INTO public.late_day_claims (
        assignment_id,
        student_email,
        student_erp,
        days_used,
        claimed_at,
        due_at_before_claim,
        due_at_after_claim,
        claim_batch_id,
        claimed_by_erp,
        claimed_by_email,
        group_id,
        claim_role
      )
      VALUES (
        v_batch.assignment_id,
        v_batch.claimed_by_email,
        v_member_erp,
        v_batch.days_used,
        v_batch.claimed_at,
        v_current_deadline,
        v_new_deadline,
        v_batch.id,
        v_batch.claimed_by_erp,
        v_batch.claimed_by_email,
        v_group.id,
        CASE
          WHEN v_member_erp = v_batch.claimed_by_erp THEN 'initiator'
          ELSE 'group_member'
        END
      );
    END LOOP;
  END LOOP;

  UPDATE public.late_day_claim_batches
  SET
    recomputed_at = now(),
    recomputed_by_email = v_ta_email
  WHERE group_id = v_group.id;

  RETURN jsonb_build_object(
    'success', true,
    'group_number', p_group_number,
    'member_count', cardinality(v_member_erps),
    'recomputed_batches', v_batch_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ta_recompute_group_late_days(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ta_recompute_group_late_days(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.ta_clear_group_roster()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ta_email text;
  v_preserved_erps text[] := ARRAY[
    '28607','30816','30817','28701','28350','26462','28205','26403','26443','26420','26503',
    '27794','28391','28089','27828','28670','28638','28593','28547','28161','28837','28289',
    '27982','27140','24463','26673','26603','28181','28234','28973','28287','27836','27835',
    '27870','28533','28099','28645','29923','30924','30043','29996','26491','29944','29952',
    '30071','31142','28700','28838','28354','28068','28681','28696','30759','28781','28793',
    '28774','25941','29970','29108','30093','30015','28483','28620','24985','30111','27784',
    '28327','30742','24406','31389','26426','27978','27953','27977','25934','28627','28800',
    '29338','28116','28694','28554','28358','28349','26018','28339','26458','31428','29937',
    '28403','28383','27938','27821','24751','25927','26895','28338','28502','27792','24753',
    '24748','28307','31104','26632','30300','24683','28843','28553','28102','28153','27948',
    '27950','28204','26736'
  ];
  v_removed_members integer := 0;
  v_removed_groups integer := 0;
  v_removed_late_day_claims integer := 0;
  v_removed_batches integer := 0;
  v_removed_sync_adjustments integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_ta_email := auth.jwt() ->> 'email';
  IF NOT public.is_ta(v_ta_email) THEN
    RAISE EXCEPTION 'Only TAs can clear the group roster';
  END IF;

  DELETE FROM public.student_group_members;
  GET DIAGNOSTICS v_removed_members = ROW_COUNT;

  DELETE FROM public.student_groups;
  GET DIAGNOSTICS v_removed_groups = ROW_COUNT;

  DELETE FROM public.late_day_claims
  WHERE student_erp IS NOT NULL
    AND student_erp <> ALL (v_preserved_erps);
  GET DIAGNOSTICS v_removed_late_day_claims = ROW_COUNT;

  DELETE FROM public.late_day_claim_batches
  WHERE claimed_by_erp IS NOT NULL
    AND claimed_by_erp <> ALL (v_preserved_erps);
  GET DIAGNOSTICS v_removed_batches = ROW_COUNT;

  DELETE FROM public.late_day_adjustments
  WHERE reason LIKE 'group-sync-max:%';
  GET DIAGNOSTICS v_removed_sync_adjustments = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'removed_members', v_removed_members,
    'removed_groups', v_removed_groups,
    'removed_late_day_claims', v_removed_late_day_claims,
    'removed_batches', v_removed_batches,
    'removed_sync_adjustments', v_removed_sync_adjustments
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ta_clear_group_roster() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ta_clear_group_roster() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'student_groups'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.student_groups;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'student_group_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.student_group_members;
  END IF;
END
$$;
