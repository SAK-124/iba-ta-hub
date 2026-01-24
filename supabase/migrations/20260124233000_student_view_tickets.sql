-- Allow students (authenticated users) to view their own tickets based on email
CREATE POLICY "Students can view their own tickets"
ON public.tickets
FOR SELECT
USING (
  auth.jwt() ->> 'email' = created_by_email
);
