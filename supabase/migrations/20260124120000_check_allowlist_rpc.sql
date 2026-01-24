-- Securely check if an email is in the allowlist without exposing the table
CREATE OR REPLACE FUNCTION public.check_ta_allowlist(check_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ta_allowlist
    WHERE email = check_email AND active = true
  );
$$;
