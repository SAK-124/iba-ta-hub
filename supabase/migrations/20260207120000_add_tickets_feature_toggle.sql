ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS tickets_enabled boolean NOT NULL DEFAULT true;

UPDATE public.app_settings
SET tickets_enabled = true
WHERE tickets_enabled IS NULL;
