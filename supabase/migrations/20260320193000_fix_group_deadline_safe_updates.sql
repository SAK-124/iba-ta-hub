BEGIN;

CREATE OR REPLACE FUNCTION public.ta_enable_group_editing_all()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ta_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_ta_email := auth.jwt() ->> 'email';
  IF NOT public.is_ta(v_ta_email) THEN
    RAISE EXCEPTION 'Only TAs can change group deadlines';
  END IF;

  UPDATE public.student_groups
  SET student_edit_locked_at = now() + interval '3 days',
      updated_at = now()
  WHERE true;

  RETURN public.list_group_admin_state();
END;
$$;

CREATE OR REPLACE FUNCTION public.ta_set_group_edit_deadline_all(p_deadline timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ta_email text;
  v_updated integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_deadline IS NULL THEN
    RAISE EXCEPTION 'Deadline is required';
  END IF;

  v_ta_email := auth.jwt() ->> 'email';
  IF NOT public.is_ta(v_ta_email) THEN
    RAISE EXCEPTION 'Only TAs can change group deadlines';
  END IF;

  UPDATE public.student_groups
  SET student_edit_locked_at = p_deadline,
      updated_at = now()
  WHERE true;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'updated_groups', v_updated,
    'deadline', p_deadline
  );
END;
$$;

COMMIT;
