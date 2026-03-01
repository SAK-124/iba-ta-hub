-- Extend public attendance board with per-student penalty session entries.
CREATE OR REPLACE FUNCTION public.get_public_attendance_board()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sessions_data jsonb;
  students_data jsonb;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'session_number', s.session_number,
        'session_date', s.session_date,
        'day_of_week', s.day_of_week
      )
      ORDER BY s.session_number
    ),
    '[]'::jsonb
  )
  INTO sessions_data
  FROM public.sessions s;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'class_no', roster.class_no,
        'student_name', roster.student_name,
        'erp', roster.erp,
        'total_penalties', COALESCE(summary.total_penalties, 0),
        'total_absences', COALESCE(summary.total_absences, 0),
        'session_status', COALESCE(summary.session_status, '{}'::jsonb),
        'penalty_entries', COALESCE(summary.penalty_entries, '[]'::jsonb)
      )
      ORDER BY roster.class_no, roster.student_name
    ),
    '[]'::jsonb
  )
  INTO students_data
  FROM public.students_roster roster
  LEFT JOIN (
    SELECT
      a.erp,
      count(*) FILTER (WHERE a.naming_penalty = true) AS total_penalties,
      count(*) FILTER (WHERE a.status = 'absent') AS total_absences,
      jsonb_object_agg(a.session_id::text, a.status) AS session_status,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'session_id', a.session_id,
            'session_number', s.session_number,
            'session_date', s.session_date,
            'day_of_week', s.day_of_week,
            'details', NULL
          )
          ORDER BY s.session_number
        ) FILTER (WHERE a.naming_penalty = true),
        '[]'::jsonb
      ) AS penalty_entries
    FROM public.attendance a
    JOIN public.sessions s
      ON s.id = a.session_id
    GROUP BY a.erp
  ) summary
    ON summary.erp = roster.erp;

  RETURN jsonb_build_object(
    'sessions', sessions_data,
    'students', students_data
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_attendance_board() TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_attendance_board() TO authenticated;
