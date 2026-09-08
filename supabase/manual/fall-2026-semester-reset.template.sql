-- Manual Fall 2026 semester reset.
--
-- SAFETY / OPERATING INSTRUCTIONS
-- 1. Take and verify a recoverable Supabase database backup before running this file.
-- 2. Open this file in the SQL editor for the intended Supabase project and replace
--    both preflight placeholders below. The SQL editor does not expose a reliable
--    project-ref identity to SQL, so the operator must visually verify the project.
-- 3. Run the whole file as one transaction. Do not run individual statements.
-- 4. If anything raises an exception, issue ROLLBACK; do not retry partial statements.
-- 5. Review the NOTICE output and ensure the script completes without assertion errors.
--
-- This script intentionally does not touch app_settings, ta_allowlist,
-- submissions_list, or penalty_types. It does not read or require the source
-- spreadsheets at execution time and does not include student email addresses.
-- `auth.users` is intentionally not modified. The new students_roster rows
-- control roster access; old auth accounts are not deleted by this reset.

BEGIN;

DO $$
DECLARE
  v_expected_project_ref text := 'REPLACE_WITH_SUPABASE_PROJECT_REF';
  v_operator text := 'REPLACE_WITH_OPERATOR_NAME';
BEGIN
  IF v_expected_project_ref LIKE 'REPLACE_WITH_%'
     OR btrim(v_expected_project_ref) = ''
     OR v_operator LIKE 'REPLACE_WITH_%'
     OR btrim(v_operator) = '' THEN
    RAISE EXCEPTION
      'Preflight required: replace the Supabase project-ref and operator placeholders before running this reset';
  END IF;

  RAISE NOTICE 'Fall 2026 reset preflight acknowledged for project % by operator %',
    v_expected_project_ref, v_operator;
END;
$$;

-- Snapshot protected account/configuration tables so the final assertion proves
-- that this reset did not change them, not merely that their row counts survived.
CREATE TEMP TABLE fall_2026_preserved_snapshots (
  table_name text PRIMARY KEY,
  row_data jsonb NOT NULL
) ON COMMIT DROP;

INSERT INTO fall_2026_preserved_snapshots (table_name, row_data)
SELECT 'app_settings', COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.id), '[]'::jsonb)
FROM public.app_settings AS s
UNION ALL
SELECT 'ta_allowlist', COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb)
FROM public.ta_allowlist AS t
UNION ALL
SELECT 'submissions_list', COALESCE(jsonb_agg(to_jsonb(sl) ORDER BY sl.id), '[]'::jsonb)
FROM public.submissions_list AS sl
UNION ALL
SELECT 'penalty_types', COALESCE(jsonb_agg(to_jsonb(pt) ORDER BY pt.id), '[]'::jsonb)
FROM public.penalty_types AS pt;

DO $$
DECLARE
  v_roster bigint;
  v_sessions bigint;
  v_attendance bigint;
  v_groups bigint;
  v_group_members bigint;
  v_join_requests bigint;
  v_tickets bigint;
  v_exceptions bigint;
  v_assignments bigint;
  v_claims bigint;
  v_batches bigint;
  v_adjustments bigint;
BEGIN
  SELECT count(*) INTO v_roster FROM public.students_roster;
  SELECT count(*) INTO v_sessions FROM public.sessions;
  SELECT count(*) INTO v_attendance FROM public.attendance;
  SELECT count(*) INTO v_groups FROM public.student_groups;
  SELECT count(*) INTO v_group_members FROM public.student_group_members;
  SELECT count(*) INTO v_join_requests FROM public.student_group_join_requests;
  SELECT count(*) INTO v_tickets FROM public.tickets;
  SELECT count(*) INTO v_exceptions FROM public.rule_exceptions;
  SELECT count(*) INTO v_assignments FROM public.late_day_assignments;
  SELECT count(*) INTO v_claims FROM public.late_day_claims;
  SELECT count(*) INTO v_batches FROM public.late_day_claim_batches;
  SELECT count(*) INTO v_adjustments FROM public.late_day_adjustments;

  RAISE NOTICE 'PRE reset counts: roster=%, sessions=%, attendance=%, groups=%, group_members=%, join_requests=%, tickets=%, rule_exceptions=%, late_day_assignments=%, late_day_claims=%, late_day_claim_batches=%, late_day_adjustments=%',
    v_roster, v_sessions, v_attendance, v_groups, v_group_members, v_join_requests, v_tickets,
    v_exceptions, v_assignments, v_claims, v_batches, v_adjustments;
END;
$$;

CREATE TEMP TABLE fall_2026_roster (
  erp text PRIMARY KEY,
  student_name text NOT NULL,
  class_no text NOT NULL
) ON COMMIT DROP;

INSERT INTO fall_2026_roster (erp, student_name, class_no)
VALUES
__FALL_2026_ROSTER_VALUES__

DO $$
DECLARE
  v_total bigint;
  v_101809 bigint;
  v_101810 bigint;
  v_101811 bigint;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE class_no = '101809'),
         count(*) FILTER (WHERE class_no = '101810'),
         count(*) FILTER (WHERE class_no = '101811')
  INTO v_total, v_101809, v_101810, v_101811
  FROM fall_2026_roster;

  RAISE NOTICE 'SOURCE roster counts: total=%, 101809=%, 101810=%, 101811=%',
    v_total, v_101809, v_101810, v_101811;

  IF v_total <> 136 OR v_101809 <> 46 OR v_101810 <> 46 OR v_101811 <> 44 THEN
    RAISE EXCEPTION
      'Source roster assertion failed: expected total=136, 101809=46, 101810=46, 101811=44; got total=%, 101809=%, 101810=%, 101811=%',
      v_total, v_101809, v_101810, v_101811;
  END IF;
END;
$$;

-- Delete operational data in dependency-safe order. Preserve the four tables
-- named at the top of this file, including the ERP 00000 test-student settings
-- stored in app_settings (the UI materializes that test student from settings).
DELETE FROM public.attendance;
DELETE FROM public.sessions;

DELETE FROM public.student_group_join_requests;
DELETE FROM public.student_group_members;
DELETE FROM public.student_groups;

DELETE FROM public.late_day_claims;
DELETE FROM public.late_day_claim_batches;
DELETE FROM public.late_day_adjustments;
DELETE FROM public.late_day_assignments;

DELETE FROM public.tickets;
DELETE FROM public.rule_exceptions;
DELETE FROM public.students_roster;

INSERT INTO public.students_roster (erp, student_name, class_no)
SELECT erp, student_name, class_no
FROM fall_2026_roster
ORDER BY class_no, student_name, erp;

DO $$
DECLARE
  v_total bigint;
  v_101809 bigint;
  v_101810 bigint;
  v_101811 bigint;
  v_bad_class bigint;
  v_config_changed text;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE class_no = '101809'),
         count(*) FILTER (WHERE class_no = '101810'),
         count(*) FILTER (WHERE class_no = '101811'),
         count(*) FILTER (WHERE class_no NOT IN ('101809', '101810', '101811'))
  INTO v_total, v_101809, v_101810, v_101811, v_bad_class
  FROM public.students_roster;

  RAISE NOTICE 'POST reset counts: roster=%, 101809=%, 101810=%, 101811=%, invalid_class_rows=%',
    v_total, v_101809, v_101810, v_101811, v_bad_class;

  IF v_total <> 136 OR v_101809 <> 46 OR v_101810 <> 46 OR v_101811 <> 44 OR v_bad_class <> 0 THEN
    RAISE EXCEPTION
      'Post-reset roster assertion failed: expected total=136, 101809=46, 101810=46, 101811=44, invalid_class_rows=0; got total=%, 101809=%, 101810=%, 101811=%, invalid_class_rows=%',
      v_total, v_101809, v_101810, v_101811, v_bad_class;
  END IF;

  IF EXISTS (SELECT 1 FROM public.attendance)
     OR EXISTS (SELECT 1 FROM public.sessions)
     OR EXISTS (SELECT 1 FROM public.student_group_members)
     OR EXISTS (SELECT 1 FROM public.student_group_join_requests)
     OR EXISTS (SELECT 1 FROM public.student_groups)
     OR EXISTS (SELECT 1 FROM public.late_day_claims)
     OR EXISTS (SELECT 1 FROM public.late_day_claim_batches)
     OR EXISTS (SELECT 1 FROM public.late_day_adjustments)
     OR EXISTS (SELECT 1 FROM public.late_day_assignments)
     OR EXISTS (SELECT 1 FROM public.tickets)
     OR EXISTS (SELECT 1 FROM public.rule_exceptions) THEN
    RAISE EXCEPTION 'Post-reset operational data assertion failed: one or more cleared tables is non-empty';
  END IF;

  RAISE NOTICE 'POST reset operational counts: attendance=%, sessions=%, join_requests=%, group_members=%, groups=%, late_day_claims=%, late_day_claim_batches=%, late_day_adjustments=%, late_day_assignments=%, tickets=%, rule_exceptions=%',
    (SELECT count(*) FROM public.attendance),
    (SELECT count(*) FROM public.sessions),
    (SELECT count(*) FROM public.student_group_join_requests),
    (SELECT count(*) FROM public.student_group_members),
    (SELECT count(*) FROM public.student_groups),
    (SELECT count(*) FROM public.late_day_claims),
    (SELECT count(*) FROM public.late_day_claim_batches),
    (SELECT count(*) FROM public.late_day_adjustments),
    (SELECT count(*) FROM public.late_day_assignments),
    (SELECT count(*) FROM public.tickets),
    (SELECT count(*) FROM public.rule_exceptions);

  SELECT string_agg(table_name, ', ' ORDER BY table_name)
  INTO v_config_changed
  FROM fall_2026_preserved_snapshots AS before_state
  WHERE before_state.row_data IS DISTINCT FROM CASE before_state.table_name
    WHEN 'app_settings' THEN (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.id), '[]'::jsonb) FROM public.app_settings AS s)
    WHEN 'ta_allowlist' THEN (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb) FROM public.ta_allowlist AS t)
    WHEN 'submissions_list' THEN (SELECT COALESCE(jsonb_agg(to_jsonb(sl) ORDER BY sl.id), '[]'::jsonb) FROM public.submissions_list AS sl)
    WHEN 'penalty_types' THEN (SELECT COALESCE(jsonb_agg(to_jsonb(pt) ORDER BY pt.id), '[]'::jsonb) FROM public.penalty_types AS pt)
  END;

  IF v_config_changed IS NOT NULL THEN
    RAISE EXCEPTION 'Protected account/configuration assertion failed; changed tables: %', v_config_changed;
  END IF;

  RAISE NOTICE 'Protected tables preserved: app_settings, ta_allowlist, submissions_list, penalty_types';
  RAISE NOTICE 'Cleared tables: attendance, sessions, student_group_join_requests, student_group_members, student_groups, late_day_claims, late_day_claim_batches, late_day_adjustments, late_day_assignments, tickets, rule_exceptions, students_roster';
END;
$$;

COMMIT;
