-- Persist final processed Zoom report per session for reload in TA workflow.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS zoom_report jsonb;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS zoom_report_saved_at timestamp with time zone;
