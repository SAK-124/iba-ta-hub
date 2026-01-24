-- 1. Confirm the Test User Email (so they are not stuck in 'awaiting confirmation')
UPDATE auth.users
SET email_confirmed_at = now()
WHERE email = 'test.00000@khi.iba.edu.pk';

-- 2. Ensure RLS Policy for Tickets Insert is correct
DROP POLICY IF EXISTS "Authenticated users can create tickets" ON public.tickets;
CREATE POLICY "Authenticated users can create tickets"
ON public.tickets
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Ensure RLS Policy for Tickets View (Own Tickets) is correct
DROP POLICY IF EXISTS "Students can view their own tickets" ON public.tickets;
CREATE POLICY "Students can view their own tickets"
ON public.tickets
FOR SELECT
USING (created_by_email = auth.jwt() ->> 'email');

-- 4. Ensure RLS Policy for TAs (Full Access)
DROP POLICY IF EXISTS "TAs can view all tickets" ON public.tickets;
CREATE POLICY "TAs can view all tickets"
ON public.tickets
FOR SELECT
USING (public.is_ta(auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "TAs can update tickets" ON public.tickets;
CREATE POLICY "TAs can update tickets"
ON public.tickets
FOR UPDATE
USING (public.is_ta(auth.jwt() ->> 'email'));
