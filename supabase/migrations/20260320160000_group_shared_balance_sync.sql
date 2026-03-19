-- Shared group late-day balances without rewriting original claim rows.
-- Original late_day_claims remain the source of truth for who actually claimed.
-- Group members inherit the shared remaining balance through derived adjustments.

CREATE OR REPLACE FUNCTION public.sync_group_shared_late_day_balance(
  p_group_id uuid,
  p_actor_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group public.student_groups%ROWTYPE;
  v_member_erps text[] := ARRAY[]::text[];
  v_member_erp text;
  v_group_used_days integer := 0;
  v_personal_used_days integer := 0;
  v_delta_needed integer := 0;
  v_adjusted_members integer := 0;
  v_reason_tag text;
  v_reason_text text;
BEGIN
  IF p_group_id IS NULL THEN
    RAISE EXCEPTION 'Group id is required';
  END IF;

  SELECT *
  INTO v_group
  FROM public.student_groups
  WHERE id = p_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group does not exist';
  END IF;

  SELECT COALESCE(array_agg(student_erp ORDER BY student_erp), ARRAY[]::text[])
  INTO v_member_erps
  FROM public.student_group_members
  WHERE group_id = p_group_id;

  v_reason_tag := format('group-shared-sync:%s', v_group.group_number);
  v_reason_text := format('%s|Synced from group claims for Group %s', v_reason_tag, v_group.group_number);

  DELETE FROM public.late_day_adjustments
  WHERE reason LIKE v_reason_tag || '%';

  IF cardinality(v_member_erps) = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'group_number', v_group.group_number,
      'member_count', 0,
      'group_used_days', 0,
      'group_remaining_days', 3,
      'adjusted_members', 0
    );
  END IF;

  SELECT COALESCE(SUM(days_used), 0)::integer
  INTO v_group_used_days
  FROM public.late_day_claims
  WHERE student_erp = ANY(v_member_erps);

  FOREACH v_member_erp IN ARRAY v_member_erps LOOP
    SELECT COALESCE(SUM(days_used), 0)::integer
    INTO v_personal_used_days
    FROM public.late_day_claims
    WHERE student_erp = v_member_erp;

    v_delta_needed := v_personal_used_days - v_group_used_days;

    IF v_delta_needed <> 0 THEN
      INSERT INTO public.late_day_adjustments (
        student_erp,
        days_delta,
        reason,
        created_by_email
      )
      VALUES (
        v_member_erp,
        v_delta_needed,
        v_reason_text,
        COALESCE(NULLIF(btrim(p_actor_email), ''), 'system-group-sync@local')
      );

      v_adjusted_members := v_adjusted_members + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'group_number', v_group.group_number,
    'member_count', cardinality(v_member_erps),
    'group_used_days', v_group_used_days,
    'group_remaining_days', GREATEST(3 - v_group_used_days, 0),
    'adjusted_members', v_adjusted_members
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_group_shared_late_day_balance(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_group_shared_late_day_balance(uuid, text) TO authenticated;

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
  v_group_id uuid;
  v_group_used integer := 0;
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

  SELECT gm.group_id, groups.group_number
  INTO v_group_id, v_group_number
  FROM public.student_group_members gm
  JOIN public.student_groups groups
    ON groups.id = gm.group_id
  WHERE gm.student_erp = v_target_erp;

  IF v_group_id IS NOT NULL THEN
    SELECT COALESCE(SUM(claim.days_used), 0)::integer
    INTO v_group_used
    FROM public.late_day_claims claim
    WHERE claim.student_erp = ANY(
      ARRAY(
        SELECT gm.student_erp
        FROM public.student_group_members gm
        WHERE gm.group_id = v_group_id
      )
    );
  END IF;

  v_total_allowance := 3 + v_granted;

  RETURN jsonb_build_object(
    'student_erp', v_target_erp,
    'group_number', v_group_number,
    'remaining', GREATEST(v_total_allowance - v_used, 0),
    'totalAllowance', v_total_allowance,
    'used', v_used,
    'granted', v_granted,
    'group_used', v_group_used,
    'group_remaining', GREATEST(3 - v_group_used, 0)
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
  END LOOP;

  SELECT COALESCE(MAX(due_at_after_claim), v_assignment_due_at)
  INTO v_current_deadline
  FROM public.late_day_claims
  WHERE assignment_id = p_assignment_id
    AND student_erp = v_student_erp;

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
    v_student_erp,
    v_user_email,
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
    v_user_email,
    v_student_erp,
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
      ELSE 'initiator'
    END
  )
  RETURNING *
  INTO v_claim_record;

  IF v_group_id IS NOT NULL THEN
    PERFORM public.sync_group_shared_late_day_balance(v_group_id, v_user_email);
  END IF;

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

REVOKE ALL ON FUNCTION public.claim_late_days(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_late_days(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.ta_adjust_all_group_late_days(p_group_number integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ta_email text;
  v_group_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_ta_email := auth.jwt() ->> 'email';
  IF NOT public.is_ta(v_ta_email) THEN
    RAISE EXCEPTION 'Only TAs can adjust grouped late days';
  END IF;

  IF p_group_number IS NULL OR p_group_number < 1 THEN
    RAISE EXCEPTION 'Group number must be a positive integer';
  END IF;

  SELECT id
  INTO v_group_id
  FROM public.student_groups
  WHERE group_number = p_group_number;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Group % does not exist', p_group_number;
  END IF;

  RETURN public.sync_group_shared_late_day_balance(v_group_id, v_ta_email);
END;
$$;

REVOKE ALL ON FUNCTION public.ta_adjust_all_group_late_days(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ta_adjust_all_group_late_days(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.ta_clear_group_roster()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ta_email text;
  v_removed_members integer := 0;
  v_removed_groups integer := 0;
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

  DELETE FROM public.late_day_claim_batches
  WHERE group_id IS NOT NULL;
  GET DIAGNOSTICS v_removed_batches = ROW_COUNT;

  DELETE FROM public.late_day_adjustments
  WHERE reason LIKE 'group-shared-sync:%'
     OR reason LIKE 'group-sync-max:%';
  GET DIAGNOSTICS v_removed_sync_adjustments = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'removed_members', v_removed_members,
    'removed_groups', v_removed_groups,
    'removed_batches', v_removed_batches,
    'removed_sync_adjustments', v_removed_sync_adjustments
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ta_clear_group_roster() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ta_clear_group_roster() TO authenticated;
