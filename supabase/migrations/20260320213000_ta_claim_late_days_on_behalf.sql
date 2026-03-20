CREATE OR REPLACE FUNCTION public.resolve_late_day_claim_student_email(p_student_erp text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_email text;
BEGIN
  SELECT ldc.student_email
  INTO v_student_email
  FROM public.late_day_claims ldc
  WHERE ldc.student_erp = p_student_erp
    AND ldc.student_email IS NOT NULL
    AND btrim(ldc.student_email) <> ''
  ORDER BY ldc.claimed_at DESC
  LIMIT 1;

  IF v_student_email IS NOT NULL THEN
    RETURN v_student_email;
  END IF;

  RETURN format('student.%s@khi.iba.edu.pk', p_student_erp);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_late_day_claim_student_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_late_day_claim_student_email(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.perform_late_day_claim(
  p_student_erp text,
  p_student_email text,
  p_actor_email text,
  p_assignment_id uuid,
  p_days integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id uuid;
  v_group_number integer;
  v_assignment_due_at timestamptz;
  v_current_deadline timestamptz;
  v_new_deadline timestamptz;
  v_minimum_days_required integer := 1;
  v_bonus_days integer := 0;
  v_total_cap integer := 3;
  v_total_used integer := 0;
  v_member_erps text[] := ARRAY[]::text[];
  v_member_erp text;
  v_claim_record public.late_day_claims%ROWTYPE;
  v_batch_id uuid;
  v_now timestamptz := now();
BEGIN
  IF p_student_erp IS NULL OR btrim(p_student_erp) = '' THEN
    RAISE EXCEPTION 'Student ERP is required';
  END IF;

  IF p_student_email IS NULL OR btrim(p_student_email) = '' THEN
    RAISE EXCEPTION 'Student email is required';
  END IF;

  IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN
    RAISE EXCEPTION 'Actor email is required';
  END IF;

  IF p_days IS NULL OR p_days < 1 THEN
    RAISE EXCEPTION 'p_days must be at least 1';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('student-group-member:' || p_student_erp));

  SELECT gm.group_id, groups.group_number
  INTO v_group_id, v_group_number
  FROM public.student_group_members gm
  JOIN public.student_groups groups
    ON groups.id = gm.group_id
  WHERE gm.student_erp = p_student_erp
  FOR UPDATE OF gm, groups;

  IF v_group_id IS NOT NULL THEN
    SELECT COALESCE(array_agg(student_erp ORDER BY student_erp), ARRAY[]::text[])
    INTO v_member_erps
    FROM public.student_group_members
    WHERE group_id = v_group_id;
  ELSE
    v_member_erps := ARRAY[p_student_erp];
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
  END LOOP;

  SELECT COALESCE(MAX(due_at_after_claim), v_assignment_due_at)
  INTO v_current_deadline
  FROM public.late_day_claims
  WHERE assignment_id = p_assignment_id
    AND student_erp = p_student_erp;

  v_minimum_days_required := GREATEST(
    CEIL(EXTRACT(EPOCH FROM (v_now - v_current_deadline)) / 86400.0)::integer,
    1
  );

  IF p_days < v_minimum_days_required THEN
    RAISE EXCEPTION 'Need at least % late day(s) to cover the current lateness', v_minimum_days_required;
  END IF;

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
    p_student_erp,
    p_actor_email,
    p_days,
    to_jsonb(v_member_erps),
    v_now
  )
  RETURNING id
  INTO v_batch_id;

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
    p_student_email,
    p_student_erp,
    p_days,
    v_now,
    v_current_deadline,
    v_new_deadline,
    v_batch_id,
    p_student_erp,
    p_actor_email,
    v_group_id,
    CASE
      WHEN v_group_id IS NULL THEN 'self'
      ELSE 'initiator'
    END
  )
  RETURNING *
  INTO v_claim_record;

  IF v_group_id IS NOT NULL THEN
    PERFORM public.sync_group_shared_late_day_balance(v_group_id, p_actor_email);
  END IF;

  SELECT COALESCE(SUM(days_delta), 0)::integer
  INTO v_bonus_days
  FROM public.late_day_adjustments
  WHERE student_erp = p_student_erp;

  SELECT COALESCE(SUM(days_used), 0)::integer
  INTO v_total_used
  FROM public.late_day_claims
  WHERE student_erp = p_student_erp;

  v_total_cap := 3 + v_bonus_days;

  RETURN jsonb_build_object(
    'claim', row_to_json(v_claim_record),
    'claim_batch_id', v_batch_id,
    'group_number', v_group_number,
    'affected_students_count', cardinality(v_member_erps),
    'total_used', v_total_used,
    'total_allowance', v_total_cap,
    'remaining_late_days', GREATEST(v_total_cap - v_total_used, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.perform_late_day_claim(text, text, text, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.perform_late_day_claim(text, text, text, uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_late_days(p_assignment_id uuid, p_days integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email text;
  v_student_erp text;
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

  RETURN public.perform_late_day_claim(
    v_student_erp,
    v_user_email,
    v_user_email,
    p_assignment_id,
    p_days
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_late_days(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_late_days(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.ta_claim_late_days(p_student_erp text, p_assignment_id uuid, p_days integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ta_email text;
  v_student_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_ta_email := auth.jwt() ->> 'email';
  IF NOT public.is_ta(v_ta_email) THEN
    RAISE EXCEPTION 'Only TAs can claim late days on behalf of students';
  END IF;

  IF p_student_erp IS NULL OR btrim(p_student_erp) = '' THEN
    RAISE EXCEPTION 'Student ERP is required';
  END IF;

  PERFORM 1
  FROM public.students_roster
  WHERE erp = p_student_erp;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student ERP not found in roster';
  END IF;

  v_student_email := public.resolve_late_day_claim_student_email(p_student_erp);

  RETURN public.perform_late_day_claim(
    p_student_erp,
    v_student_email,
    v_ta_email,
    p_assignment_id,
    p_days
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ta_claim_late_days(text, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ta_claim_late_days(text, uuid, integer) TO authenticated;
