-- Allow negative late-day adjustments so TA group sync can reduce balance
-- without rewriting original claim history.

ALTER TABLE public.late_day_adjustments
  DROP CONSTRAINT IF EXISTS late_day_adjustments_days_delta_check;

ALTER TABLE public.late_day_adjustments
  ADD CONSTRAINT late_day_adjustments_days_delta_check CHECK (days_delta <> 0);

CREATE OR REPLACE FUNCTION public.ta_adjust_all_group_late_days(p_group_number integer)
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
  v_used_by_member integer := 0;
  v_max_used integer := 0;
  v_existing_sync integer := 0;
  v_delta_needed integer := 0;
  v_adjusted_members integer := 0;
  v_sync_reason text;
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
    RAISE EXCEPTION 'Group % has no members to adjust', p_group_number;
  END IF;

  v_sync_reason := format('group-sync-max:%s', p_group_number);

  FOREACH v_member_erp IN ARRAY v_member_erps LOOP
    PERFORM pg_advisory_xact_lock(hashtext('student-group-member:' || v_member_erp));

    SELECT COALESCE(SUM(days_used), 0)::integer
    INTO v_used_by_member
    FROM public.late_day_claims
    WHERE student_erp = v_member_erp;

    v_max_used := GREATEST(v_max_used, v_used_by_member);
  END LOOP;

  DELETE FROM public.late_day_adjustments
  WHERE reason = v_sync_reason;

  FOREACH v_member_erp IN ARRAY v_member_erps LOOP
    SELECT COALESCE(SUM(days_used), 0)::integer
    INTO v_used_by_member
    FROM public.late_day_claims
    WHERE student_erp = v_member_erp;

    SELECT COALESCE(SUM(days_delta), 0)::integer
    INTO v_existing_sync
    FROM public.late_day_adjustments
    WHERE student_erp = v_member_erp
      AND reason = v_sync_reason;

    v_delta_needed := -(v_max_used - v_used_by_member) - v_existing_sync;

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
        v_sync_reason,
        v_ta_email
      );

      IF v_max_used > v_used_by_member THEN
        v_adjusted_members := v_adjusted_members + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'group_number', p_group_number,
    'member_count', cardinality(v_member_erps),
    'max_used_days', v_max_used,
    'adjusted_members', v_adjusted_members
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ta_adjust_all_group_late_days(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ta_adjust_all_group_late_days(integer) TO authenticated;
