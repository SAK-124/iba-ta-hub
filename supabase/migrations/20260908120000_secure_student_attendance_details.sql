-- Return only the authenticated student's attendance and the matching row from
-- each saved Zoom report.  This migration is intentionally not applied here.
CREATE OR REPLACE FUNCTION public._attendance_safe_numeric(value text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
BEGIN
  IF value IS NULL OR btrim(value) = '' THEN RETURN NULL; END IF;
  RETURN value::numeric;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._attendance_safe_numeric(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_student_attendance(student_erp text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_erp text;
  v_email text;
  v_records jsonb;
  v_total_absences bigint;
  v_total_naming_penalties bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_email := auth.jwt() ->> 'email';
  v_auth_erp := public.current_student_erp_from_auth();
  IF NOT public.is_ta(v_email) AND student_erp IS DISTINCT FROM v_auth_erp THEN
    RAISE EXCEPTION 'You may only view your own attendance';
  END IF;

  SELECT COALESCE(jsonb_agg(record_payload ORDER BY session_number DESC), '[]'::jsonb)
    INTO v_records
  FROM (
    SELECT
      s.session_number,
      jsonb_build_object(
        'session_id', s.id,
        'session_number', s.session_number,
        'session_date', s.session_date,
        'day_of_week', s.day_of_week,
        'status', a.status,
        'naming_penalty', a.naming_penalty,
        'details_available', zoom_row IS NOT NULL,
        'source_type', CASE WHEN zoom_row IS NULL THEN 'manual_or_legacy' ELSE 'zoom_report' END,
        'session_start_time', s.start_time,
        'session_end_time', s.end_time,
        'official_minutes', public._attendance_safe_numeric(s.zoom_report ->> 'total_class_minutes'),
        'effective_minutes', public._attendance_safe_numeric(s.zoom_report ->> 'effective_class_minutes'),
        'namaz_break_minutes', CASE
          WHEN public._attendance_safe_numeric(s.zoom_report ->> 'effective_class_minutes') IS NULL THEN 0
          ELSE GREATEST(
            COALESCE(public._attendance_safe_numeric(s.zoom_report ->> 'total_class_minutes'), 0)
            - COALESCE(public._attendance_safe_numeric(s.zoom_report ->> 'effective_class_minutes'), 0), 0
          )
        END,
        'attended_minutes', COALESCE(public._attendance_safe_numeric(zoom_row ->> 'Attended Minutes'), 0),
        'required_minutes', public._attendance_safe_numeric(zoom_row ->> 'Required Minutes'),
        'shortfall_minutes', GREATEST(
          COALESCE(public._attendance_safe_numeric(zoom_row ->> 'Required Minutes'), 0)
          - COALESCE(public._attendance_safe_numeric(zoom_row ->> 'Attended Minutes'), 0), 0
        ),
        'zoom_names', NULLIF(zoom_row ->> 'Zoom Name', ''),
        'name_format', NULLIF(zoom_row ->> 'Name Format', ''),
        'match_method', NULLIF(zoom_row ->> 'Match Method', ''),
        'explanation_code', CASE
          WHEN a.status = 'excused' THEN 'excused'
          WHEN zoom_row IS NULL THEN 'manual_or_legacy'
          WHEN a.status = 'absent' AND COALESCE(public._attendance_safe_numeric(zoom_row ->> 'Attended Minutes'), 0) = 0 THEN 'no_zoom_match'
          WHEN a.status = 'absent' AND COALESCE(public._attendance_safe_numeric(zoom_row ->> 'Attended Minutes'), 0) < COALESCE(public._attendance_safe_numeric(zoom_row ->> 'Required Minutes'), 0) THEN 'below_cutoff'
          WHEN a.status = 'absent' THEN 'ta_override'
          ELSE 'present'
        END
      ) AS record_payload
    FROM public.attendance a
    JOIN public.sessions s ON s.id = a.session_id
    LEFT JOIN LATERAL (
      SELECT value AS zoom_row
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(s.zoom_report -> 'attendance_rows') = 'array'
          THEN s.zoom_report -> 'attendance_rows' ELSE '[]'::jsonb END
      )
      WHERE value ->> 'ERP' = student_erp
      LIMIT 1
    ) matched ON true
    WHERE a.erp = student_erp
  ) rows;

  SELECT count(*) INTO v_total_absences FROM public.attendance WHERE erp = student_erp AND status = 'absent';
  SELECT count(*) INTO v_total_naming_penalties FROM public.attendance WHERE erp = student_erp AND naming_penalty = true;

  RETURN jsonb_build_object(
    'records', v_records,
    'total_absences', v_total_absences,
    'total_naming_penalties', v_total_naming_penalties
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_attendance(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_attendance(text) TO authenticated;
