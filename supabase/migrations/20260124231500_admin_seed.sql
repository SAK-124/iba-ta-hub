-- Add Saboor to TA allowlist
INSERT INTO public.ta_allowlist (email, active)
VALUES ('saboor12124@gmail.com', true)
ON CONFLICT (email) DO NOTHING;
