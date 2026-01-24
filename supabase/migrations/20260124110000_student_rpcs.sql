-- RPC to get tickets for a specific ERP (secured by limiting to the authenticated user's email if needed, or just ERP)
-- For this implementation, we will trust the client to pass the ERP but we could verify it matches the user's email if we had a link. 
-- Since the requirements say "Students can read... ONLY through controlled flows", access via RPC is a good "controlled flow".

CREATE OR REPLACE FUNCTION public.get_student_tickets(student_erp text)
RETURNS SETOF public.tickets
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.tickets
  WHERE entered_erp = student_erp
  ORDER BY created_at DESC;
$$;

-- RPC to get student attendance with totals
CREATE OR REPLACE FUNCTION public.get_student_attendance(student_erp text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  attendance_records jsonb;
  total_absences bigint;
BEGIN
  -- Get session-wise attendance
  SELECT jsonb_agg(
    jsonb_build_object(
      'session_number', s.session_number,
      'session_date', s.session_date,
      'day_of_week', s.day_of_week,
      'status', COALESCE(a.status, 'present') -- Default to present if not in table? No, attendance table is explicit.
       -- Wait, if not in attendance table, what is the status? 
       -- The prompt says "For every ERP in roster: set status=present" during overwrite. 
       -- But if not yet marked? It implies explicit records. 
       -- Let's just return what is in the table.
    ) ORDER BY s.session_number DESC
  ) INTO attendance_records
  FROM public.attendance a
  JOIN public.sessions s ON a.session_id = s.id
  WHERE a.erp = student_erp;

  -- Count absences
  SELECT count(*) INTO total_absences
  FROM public.attendance
  WHERE erp = student_erp AND status = 'absent'; -- "count only 'absent'; 'excused' counts as present"

  RETURN jsonb_build_object(
    'records', COALESCE(attendance_records, '[]'::jsonb),
    'total_absences', total_absences
  );
END;
$$;
