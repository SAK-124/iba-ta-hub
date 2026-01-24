-- Seed initial TA
TRUNCATE public.ta_allowlist; -- Clean up placeholders if safe, or just delete them. 
-- Better to just delete the placeholders explicitly if they exist to avoid wiping real data in a future re-run (though this is a migration so it runs once).
DELETE FROM public.ta_allowlist WHERE email LIKE 'TA_EMAIL_%';

INSERT INTO public.ta_allowlist (email, active) VALUES 
('saboor12124@gmail.com', true)
ON CONFLICT (email) DO NOTHING;
