-- Allow creating late-day assignments without a deadline.
-- Claims remain blocked until a deadline is set.

ALTER TABLE public.late_day_assignments
  ALTER COLUMN due_at DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_late_days(p_assignment_id uuid, p_days integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email text;
  v_student_erp text;
  v_total_cap integer := 3;
  v_total_used integer := 0;
  v_assignment_due_at timestamptz;
  v_current_deadline timestamptz;
  v_new_deadline timestamptz;
  v_now timestamptz := now();
  v_claim_record public.late_day_claims%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_user_email := auth.jwt() ->> 'email';
  IF v_user_email IS NULL OR btrim(v_user_email) = '' THEN
    RAISE EXCEPTION 'Could not determine user email';
  END IF;

  v_student_erp := substring(v_user_email FROM '(\d{5})@');
  IF v_student_erp IS NULL THEN
    RAISE EXCEPTION 'Could not derive ERP from email';
  END IF;

  IF p_days IS NULL OR p_days < 1 THEN
    RAISE EXCEPTION 'p_days must be at least 1';
  END IF;

  IF p_days > v_total_cap THEN
    RAISE EXCEPTION 'p_days cannot exceed %', v_total_cap;
  END IF;

  -- Prevent race conditions for concurrent claims by the same user.
  PERFORM pg_advisory_xact_lock(hashtext(v_user_email));

  SELECT COALESCE(SUM(days_used), 0)::integer
  INTO v_total_used
  FROM public.late_day_claims
  WHERE student_email = v_user_email;

  IF v_total_used + p_days > v_total_cap THEN
    RAISE EXCEPTION 'Late day cap exceeded. Remaining: %', (v_total_cap - v_total_used);
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

  SELECT COALESCE(MAX(due_at_after_claim), v_assignment_due_at)
  INTO v_current_deadline
  FROM public.late_day_claims
  WHERE assignment_id = p_assignment_id
    AND student_email = v_user_email;

  IF v_now > v_current_deadline THEN
    RAISE EXCEPTION 'Claim window has closed for this assignment';
  END IF;

  v_new_deadline := v_current_deadline + (p_days * interval '24 hours');

  INSERT INTO public.late_day_claims (
    assignment_id,
    student_email,
    student_erp,
    days_used,
    claimed_at,
    due_at_before_claim,
    due_at_after_claim
  )
  VALUES (
    p_assignment_id,
    v_user_email,
    v_student_erp,
    p_days,
    v_now,
    v_current_deadline,
    v_new_deadline
  )
  RETURNING *
  INTO v_claim_record;

  RETURN jsonb_build_object(
    'claim', row_to_json(v_claim_record),
    'total_used', v_total_used + p_days,
    'remaining_late_days', v_total_cap - (v_total_used + p_days)
  );
END;
$$;
