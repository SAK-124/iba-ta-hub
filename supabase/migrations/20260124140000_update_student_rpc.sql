-- Update RPC to include naming penalties
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
  total_naming_penalties bigint;
BEGIN
  -- Get session-wise attendance
  SELECT jsonb_agg(
    jsonb_build_object(
      'session_number', s.session_number,
      'session_date', s.session_date,
      'day_of_week', s.day_of_week,
      'status', a.status,
      'naming_penalty', a.naming_penalty
    ) ORDER BY s.session_number DESC
  ) INTO attendance_records
  FROM public.attendance a
  JOIN public.sessions s ON a.session_id = s.id
  WHERE a.erp = student_erp;

  -- Count absences
  SELECT count(*) INTO total_absences
  FROM public.attendance
  WHERE erp = student_erp AND status = 'absent';

  -- Count naming penalties
  SELECT count(*) INTO total_naming_penalties
  FROM public.attendance
  WHERE erp = student_erp AND naming_penalty = true;

  RETURN jsonb_build_object(
    'records', COALESCE(attendance_records, '[]'::jsonb),
    'total_absences', total_absences,
    'total_naming_penalties', total_naming_penalties
  );
END;
$$;
