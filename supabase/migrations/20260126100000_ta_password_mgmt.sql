-- Add initial_password column to ta_allowlist
ALTER TABLE public.ta_allowlist 
ADD COLUMN IF NOT EXISTS initial_password text;

-- Create RPC to securely verify initial password setup
CREATE OR REPLACE FUNCTION verify_ta_setup(check_email text, check_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stored_password text;
BEGIN
  -- Get the initial password for the email
  SELECT initial_password INTO stored_password
  FROM public.ta_allowlist
  WHERE email = check_email;

  -- If no record or no password set, return false (cannot use this method)
  IF stored_password IS NULL THEN
    RETURN false;
  END IF;

  -- Compare passwords (simple text comparison for initial setup)
  RETURN stored_password = check_password;
END;
$$;

-- Insert new TA with initial password
INSERT INTO public.ta_allowlist (email, initial_password)
VALUES ('ayeshamaqsood5100@gmail.com', 'Ayesha12124')
ON CONFLICT (email) 
DO UPDATE SET initial_password = EXCLUDED.initial_password;
