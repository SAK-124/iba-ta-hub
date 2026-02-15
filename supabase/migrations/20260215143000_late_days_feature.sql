-- Late days feature:
-- - TA-managed assignments with deadlines
-- - Student claim flow through a controlled RPC
-- - Immutable claim records (student cannot edit/delete)

CREATE TABLE IF NOT EXISTS public.late_day_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  due_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.late_day_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.late_day_assignments(id) ON DELETE RESTRICT,
  student_email text NOT NULL,
  student_erp text NOT NULL,
  days_used integer NOT NULL CHECK (days_used BETWEEN 1 AND 3),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  due_at_before_claim timestamptz NOT NULL,
  due_at_after_claim timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_late_day_assignments_active_due
  ON public.late_day_assignments(active, due_at);

CREATE INDEX IF NOT EXISTS idx_late_day_claims_student_claimed_desc
  ON public.late_day_claims(student_email, claimed_at DESC);

CREATE INDEX IF NOT EXISTS idx_late_day_claims_assignment_claimed_desc
  ON public.late_day_claims(assignment_id, claimed_at DESC);

ALTER TABLE public.late_day_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.late_day_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view late day assignments" ON public.late_day_assignments;
CREATE POLICY "Authenticated users can view late day assignments"
  ON public.late_day_assignments
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "TAs can insert late day assignments" ON public.late_day_assignments;
CREATE POLICY "TAs can insert late day assignments"
  ON public.late_day_assignments
  FOR INSERT
  WITH CHECK (public.is_ta(auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "TAs can update late day assignments" ON public.late_day_assignments;
CREATE POLICY "TAs can update late day assignments"
  ON public.late_day_assignments
  FOR UPDATE
  USING (public.is_ta(auth.jwt() ->> 'email'))
  WITH CHECK (public.is_ta(auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "TAs can delete late day assignments" ON public.late_day_assignments;
CREATE POLICY "TAs can delete late day assignments"
  ON public.late_day_assignments
  FOR DELETE
  USING (public.is_ta(auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "Students can view their own late day claims" ON public.late_day_claims;
CREATE POLICY "Students can view their own late day claims"
  ON public.late_day_claims
  FOR SELECT
  USING (student_email = auth.jwt() ->> 'email');

DROP POLICY IF EXISTS "TAs can view all late day claims" ON public.late_day_claims;
CREATE POLICY "TAs can view all late day claims"
  ON public.late_day_claims
  FOR SELECT
  USING (public.is_ta(auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "TAs can delete late day claims" ON public.late_day_claims;
CREATE POLICY "TAs can delete late day claims"
  ON public.late_day_claims
  FOR DELETE
  USING (public.is_ta(auth.jwt() ->> 'email'));

DROP TRIGGER IF EXISTS update_late_day_assignments_updated_at ON public.late_day_assignments;
CREATE TRIGGER update_late_day_assignments_updated_at
  BEFORE UPDATE ON public.late_day_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

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

REVOKE ALL ON FUNCTION public.claim_late_days(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_late_days(uuid, integer) TO authenticated;
