DO $$
DECLARE
  table_name text;
  schema_name text;
  relation_name text;
  realtime_tables text[] := ARRAY[
    'public.attendance',
    'public.students_roster',
    'public.sessions',
    'public.rule_exceptions',
    'public.late_day_assignments',
    'public.late_day_claims',
    'public.late_day_adjustments',
    'public.app_settings',
    'public.submissions_list',
    'public.ta_allowlist'
  ];
BEGIN
  FOREACH table_name IN ARRAY realtime_tables LOOP
    schema_name := split_part(table_name, '.', 1);
    relation_name := split_part(table_name, '.', 2);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = schema_name
        AND tablename = relation_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I', schema_name, relation_name);
    END IF;
  END LOOP;
END
$$;
