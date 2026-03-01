ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS show_test_student_in_ta boolean NOT NULL DEFAULT false;

ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS test_student_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.app_settings
SET show_test_student_in_ta = false
WHERE show_test_student_in_ta IS NULL;

UPDATE public.app_settings
SET test_student_overrides = '{}'::jsonb
WHERE test_student_overrides IS NULL;
