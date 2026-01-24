-- Force confirm all users to ensure RLS doesn't block them
UPDATE auth.users
SET email_confirmed_at = now()
WHERE email_confirmed_at IS NULL;

-- Re-apply Insert Policy (Simpler Name)
DROP POLICY IF EXISTS "Authenticated users can create tickets" ON public.tickets;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.tickets;

CREATE POLICY "Enable insert for authenticated users"
ON public.tickets
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Check triggers (just to be safe, though this shouldn't block)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_tickets_updated_at') THEN
        CREATE TRIGGER update_tickets_updated_at
        BEFORE UPDATE ON public.tickets
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END $$;
