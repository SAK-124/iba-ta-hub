-- Safety migration for environments where late_day_assignments.due_at
-- may still be NOT NULL from an earlier SQL run.
ALTER TABLE public.late_day_assignments
  ALTER COLUMN due_at DROP NOT NULL;
