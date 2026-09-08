-- Allow TAs to remove one test or obsolete group without clearing the roster.
-- This migration is intentionally not applied here.
BEGIN;

CREATE OR REPLACE FUNCTION public.ta_delete_group(p_group_number integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ta_email text;
  v_group_id uuid;
  v_removed_members integer := 0;
  v_removed_join_requests integer := 0;
  v_removed_batches integer := 0;
  v_removed_sync_adjustments integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_ta_email := auth.jwt() ->> 'email';
  IF NOT public.is_ta(v_ta_email) THEN
    RAISE EXCEPTION 'Only TAs can delete a group';
  END IF;
  IF p_group_number IS NULL OR p_group_number < 1 THEN
    RAISE EXCEPTION 'Group number must be a positive integer';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('student-group-number:' || p_group_number::text));

  SELECT id
  INTO v_group_id
  FROM public.student_groups
  WHERE group_number = p_group_number
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group % does not exist', p_group_number;
  END IF;

  DELETE FROM public.late_day_adjustments
  WHERE reason LIKE format('group-shared-sync:%s%%', p_group_number)
     OR reason = format('group-sync-max:%s', p_group_number);
  GET DIAGNOSTICS v_removed_sync_adjustments = ROW_COUNT;

  DELETE FROM public.late_day_claim_batches
  WHERE group_id = v_group_id;
  GET DIAGNOSTICS v_removed_batches = ROW_COUNT;

  DELETE FROM public.student_group_join_requests
  WHERE group_id = v_group_id;
  GET DIAGNOSTICS v_removed_join_requests = ROW_COUNT;

  DELETE FROM public.student_group_members
  WHERE group_id = v_group_id;
  GET DIAGNOSTICS v_removed_members = ROW_COUNT;

  -- late_day_claims and attendance are intentionally preserved. Their
  -- group_id/claim_batch_id foreign keys safely become NULL as applicable.
  DELETE FROM public.student_groups
  WHERE id = v_group_id;

  RETURN jsonb_build_object(
    'success', true,
    'group_number', p_group_number,
    'removed_members', v_removed_members,
    'removed_join_requests', v_removed_join_requests,
    'removed_batches', v_removed_batches,
    'removed_sync_adjustments', v_removed_sync_adjustments
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ta_delete_group(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ta_delete_group(integer) TO authenticated;

COMMIT;
