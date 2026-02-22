-- Ensure the column exists for TA-visible password storage.
ALTER TABLE public.ta_allowlist
ADD COLUMN IF NOT EXISTS initial_password text;

-- Returns only the authenticated TA's own stored visible password.
CREATE OR REPLACE FUNCTION public.get_my_ta_password()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email text;
  current_password text;
BEGIN
  caller_email := auth.jwt() ->> 'email';

  IF caller_email IS NULL OR caller_email = '' THEN
    RAISE EXCEPTION 'Missing authenticated email';
  END IF;

  IF NOT public.is_ta(caller_email) THEN
    RAISE EXCEPTION 'Only TAs can access this function';
  END IF;

  SELECT initial_password
    INTO current_password
  FROM public.ta_allowlist
  WHERE email = caller_email
  LIMIT 1;

  RETURN current_password;
END;
$$;

-- Updates only the authenticated TA's own stored visible password.
CREATE OR REPLACE FUNCTION public.set_my_ta_password(new_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email text;
BEGIN
  caller_email := auth.jwt() ->> 'email';

  IF caller_email IS NULL OR caller_email = '' THEN
    RAISE EXCEPTION 'Missing authenticated email';
  END IF;

  IF NOT public.is_ta(caller_email) THEN
    RAISE EXCEPTION 'Only TAs can access this function';
  END IF;

  IF new_password IS NULL OR char_length(new_password) = 0 THEN
    RAISE EXCEPTION 'Password cannot be empty';
  END IF;

  UPDATE public.ta_allowlist
  SET initial_password = new_password
  WHERE email = caller_email;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TA allowlist record not found for %', caller_email;
  END IF;
END;
$$;

-- Prevent direct client access to the sensitive column.
REVOKE SELECT (initial_password) ON public.ta_allowlist FROM authenticated, anon;
REVOKE UPDATE (initial_password) ON public.ta_allowlist FROM authenticated, anon;

-- Allow authenticated clients to use the self-scoped RPCs.
GRANT EXECUTE ON FUNCTION public.get_my_ta_password() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_ta_password(text) TO authenticated;
