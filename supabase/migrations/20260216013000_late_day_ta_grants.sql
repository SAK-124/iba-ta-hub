-- TA-managed late-day grants.
-- These increase a student's total allowance beyond the base 3 days.

CREATE TABLE IF NOT EXISTS public.late_day_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_erp text NOT NULL,
  days_delta integer NOT NULL CHECK (days_delta > 0),
  reason text,
  created_by_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_late_day_adjustments_student_created_desc
  ON public.late_day_adjustments(student_erp, created_at DESC);

ALTER TABLE public.late_day_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can view their own late day adjustments" ON public.late_day_adjustments;
CREATE POLICY "Students can view their own late day adjustments"
  ON public.late_day_adjustments
  FOR SELECT
  USING (student_erp = substring(auth.jwt() ->> 'email' FROM '(\d{5})@'));

DROP POLICY IF EXISTS "TAs can view all late day adjustments" ON public.late_day_adjustments;
CREATE POLICY "TAs can view all late day adjustments"
  ON public.late_day_adjustments
  FOR SELECT
  USING (public.is_ta(auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "TAs can insert late day adjustments" ON public.late_day_adjustments;
CREATE POLICY "TAs can insert late day adjustments"
  ON public.late_day_adjustments
  FOR INSERT
  WITH CHECK (public.is_ta(auth.jwt() ->> 'email'));

CREATE OR REPLACE FUNCTION public.ta_add_late_day(p_student_erp text, p_days integer, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ta_email text;
  v_student_exists boolean;
  v_adjustment public.late_day_adjustments%ROWTYPE;
  v_total_granted integer := 0;
  v_total_used integer := 0;
  v_remaining integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_ta_email := auth.jwt() ->> 'email';
  IF NOT public.is_ta(v_ta_email) THEN
    RAISE EXCEPTION 'Only TAs can add late days';
  END IF;

  IF p_student_erp IS NULL OR btrim(p_student_erp) = '' THEN
    RAISE EXCEPTION 'Student ERP is required';
  END IF;

  IF p_days IS NULL OR p_days < 1 THEN
    RAISE EXCEPTION 'Days must be at least 1';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.students_roster
    WHERE erp = p_student_erp
  )
  INTO v_student_exists;

  IF NOT v_student_exists THEN
    RAISE EXCEPTION 'Student ERP not found in roster';
  END IF;

  INSERT INTO public.late_day_adjustments (
    student_erp,
    days_delta,
    reason,
    created_by_email
  )
  VALUES (
    p_student_erp,
    p_days,
    NULLIF(btrim(p_reason), ''),
    v_ta_email
  )
  RETURNING *
  INTO v_adjustment;

  SELECT COALESCE(SUM(days_delta), 0)::integer
  INTO v_total_granted
  FROM public.late_day_adjustments
  WHERE student_erp = p_student_erp;

  SELECT COALESCE(SUM(days_used), 0)::integer
  INTO v_total_used
  FROM public.late_day_claims
  WHERE student_erp = p_student_erp;

  v_remaining := GREATEST((3 + v_total_granted) - v_total_used, 0);

  RETURN jsonb_build_object(
    'adjustment', row_to_json(v_adjustment),
    'remaining_late_days', v_remaining,
    'total_granted', v_total_granted,
    'total_used', v_total_used
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ta_add_late_day(text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ta_add_late_day(text, integer, text) TO authenticated;

-- Update claim RPC to incorporate TA grants and keep deadline required for students.
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
  v_bonus_days integer := 0;
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

  PERFORM pg_advisory_xact_lock(hashtext(v_student_erp));

  SELECT COALESCE(SUM(days_delta), 0)::integer
  INTO v_bonus_days
  FROM public.late_day_adjustments
  WHERE student_erp = v_student_erp;

  v_total_cap := v_total_cap + v_bonus_days;

  IF p_days > v_total_cap THEN
    RAISE EXCEPTION 'Requested days exceed allowance';
  END IF;

  SELECT COALESCE(SUM(days_used), 0)::integer
  INTO v_total_used
  FROM public.late_day_claims
  WHERE student_erp = v_student_erp;

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
    AND student_erp = v_student_erp;

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
    'total_allowance', v_total_cap,
    'remaining_late_days', v_total_cap - (v_total_used + p_days)
  );
END;
$$;
