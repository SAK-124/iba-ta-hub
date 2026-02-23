-- Allow full day selection and support optional session start time.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS start_time time;

-- Previous schema only allowed Friday/Saturday.
ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_day_of_week_check;

-- Keep validation lightweight: any non-empty day label is accepted.
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_day_of_week_check
  CHECK (length(trim(day_of_week)) > 0);
