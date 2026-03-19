BEGIN;

ALTER TABLE public.student_groups
  ADD COLUMN IF NOT EXISTS display_name text;

CREATE OR REPLACE FUNCTION public.get_student_groups_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_student_erp text;
  v_current_group_id uuid;
  v_groups jsonb := '[]'::jsonb;
  v_roster jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_email := auth.jwt() ->> 'email';
  v_student_erp := public.current_student_erp_from_auth();

  IF v_student_erp IS NULL THEN
    RAISE EXCEPTION 'Could not derive ERP from email';
  END IF;

  SELECT gm.group_id
  INTO v_current_group_id
  FROM public.student_group_members gm
  WHERE gm.student_erp = v_student_erp;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', g.id,
        'group_number', g.group_number,
        'display_name', g.display_name,
        'created_by_erp', g.created_by_erp,
        'created_by_email', g.created_by_email,
        'created_by_role', g.created_by_role,
        'student_edit_locked_at', g.student_edit_locked_at,
        'created_at', g.created_at,
        'updated_at', g.updated_at,
        'is_locked', now() > g.student_edit_locked_at,
        'member_count', COALESCE(member_counts.member_count, 0),
        'members', COALESCE(member_payload.members, '[]'::jsonb)
      )
      ORDER BY g.group_number
    ),
    '[]'::jsonb
  )
  INTO v_groups
  FROM public.student_groups g
  LEFT JOIN (
    SELECT group_id, COUNT(*)::integer AS member_count
    FROM public.student_group_members
    GROUP BY group_id
  ) member_counts ON member_counts.group_id = g.id
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'erp', roster.erp,
          'student_name', roster.student_name,
          'class_no', roster.class_no
        )
        ORDER BY roster.class_no, roster.student_name
      ),
      '[]'::jsonb
    ) AS members
    FROM public.student_group_members gm
    JOIN public.students_roster roster
      ON roster.erp = gm.student_erp
    WHERE gm.group_id = g.id
  ) member_payload ON true;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'erp', roster.erp,
        'student_name', roster.student_name,
        'class_no', roster.class_no,
        'group_number', groups.group_number
      )
      ORDER BY roster.class_no, roster.student_name
    ),
    '[]'::jsonb
  )
  INTO v_roster
  FROM public.students_roster roster
  LEFT JOIN public.student_group_members gm
    ON gm.student_erp = roster.erp
  LEFT JOIN public.student_groups groups
    ON groups.id = gm.group_id;

  RETURN jsonb_build_object(
    'student_email', v_email,
    'student_erp', v_student_erp,
    'current_group_id', v_current_group_id,
    'groups', v_groups,
    'roster', v_roster
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_group_admin_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ta_email text;
  v_groups jsonb := '[]'::jsonb;
  v_roster jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_ta_email := auth.jwt() ->> 'email';
  IF NOT public.is_ta(v_ta_email) THEN
    RAISE EXCEPTION 'Only TAs can access group admin state';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', g.id,
        'group_number', g.group_number,
        'display_name', g.display_name,
        'created_by_erp', g.created_by_erp,
        'created_by_email', g.created_by_email,
        'created_by_role', g.created_by_role,
        'student_edit_locked_at', g.student_edit_locked_at,
        'created_at', g.created_at,
        'updated_at', g.updated_at,
        'is_locked', now() > g.student_edit_locked_at,
        'member_count', COALESCE(member_counts.member_count, 0),
        'members', COALESCE(member_payload.members, '[]'::jsonb)
      )
      ORDER BY g.group_number
    ),
    '[]'::jsonb
  )
  INTO v_groups
  FROM public.student_groups g
  LEFT JOIN (
    SELECT group_id, COUNT(*)::integer AS member_count
    FROM public.student_group_members
    GROUP BY group_id
  ) member_counts ON member_counts.group_id = g.id
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'erp', roster.erp,
          'student_name', roster.student_name,
          'class_no', roster.class_no
        )
        ORDER BY roster.class_no, roster.student_name
      ),
      '[]'::jsonb
    ) AS members
    FROM public.student_group_members gm
    JOIN public.students_roster roster
      ON roster.erp = gm.student_erp
    WHERE gm.group_id = g.id
  ) member_payload ON true;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'erp', roster.erp,
        'student_name', roster.student_name,
        'class_no', roster.class_no,
        'group_number', groups.group_number
      )
      ORDER BY roster.class_no, roster.student_name
    ),
    '[]'::jsonb
  )
  INTO v_roster
  FROM public.students_roster roster
  LEFT JOIN public.student_group_members gm
    ON gm.student_erp = roster.erp
  LEFT JOIN public.student_groups groups
    ON groups.id = gm.group_id;

  RETURN jsonb_build_object(
    'viewer_email', v_ta_email,
    'groups', v_groups,
    'roster', v_roster
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ta_create_group(
  p_group_number integer,
  p_display_name text DEFAULT NULL,
  p_student_erps text[] DEFAULT ARRAY[]::text[],
  p_edit_deadline timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ta_email text;
  v_group_id uuid;
  v_student_erp text;
  v_distinct_student_erps text[];
  v_existing_group_id uuid;
  v_existing_group public.student_groups%ROWTYPE;
  v_exists boolean;
  v_deadline timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_ta_email := auth.jwt() ->> 'email';
  IF NOT public.is_ta(v_ta_email) THEN
    RAISE EXCEPTION 'Only TAs can create groups';
  END IF;

  IF p_group_number IS NULL OR p_group_number < 1 THEN
    RAISE EXCEPTION 'Group number must be a positive integer';
  END IF;

  v_distinct_student_erps := ARRAY(
    SELECT DISTINCT btrim(value)
    FROM unnest(COALESCE(p_student_erps, ARRAY[]::text[])) AS value
    WHERE NULLIF(btrim(value), '') IS NOT NULL
  );

  IF COALESCE(array_length(v_distinct_student_erps, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Select at least one student';
  END IF;

  IF COALESCE(array_length(v_distinct_student_erps, 1), 0) > 5 THEN
    RAISE EXCEPTION 'Groups can contain at most 5 students';
  END IF;

  v_deadline := COALESCE(p_edit_deadline, now() + interval '3 days');

  PERFORM pg_advisory_xact_lock(hashtext('student-group-number:' || p_group_number::text));

  IF EXISTS (
    SELECT 1
    FROM public.student_groups
    WHERE group_number = p_group_number
  ) THEN
    RAISE EXCEPTION 'Group % already exists', p_group_number;
  END IF;

  INSERT INTO public.student_groups (
    group_number,
    display_name,
    created_by_erp,
    created_by_email,
    created_by_role,
    student_edit_locked_at
  )
  VALUES (
    p_group_number,
    NULLIF(btrim(COALESCE(p_display_name, '')), ''),
    NULL,
    v_ta_email,
    'ta',
    v_deadline
  )
  RETURNING id INTO v_group_id;

  FOREACH v_student_erp IN ARRAY v_distinct_student_erps LOOP
    PERFORM pg_advisory_xact_lock(hashtext('student-group-member:' || v_student_erp));

    SELECT EXISTS(
      SELECT 1
      FROM public.students_roster
      WHERE erp = v_student_erp
    )
    INTO v_exists;

    IF NOT v_exists THEN
      RAISE EXCEPTION 'Student ERP not found in roster: %', v_student_erp;
    END IF;

    SELECT gm.group_id
    INTO v_existing_group_id
    FROM public.student_group_members gm
    WHERE gm.student_erp = v_student_erp
    FOR UPDATE;

    IF v_existing_group_id IS NOT NULL THEN
      SELECT *
      INTO v_existing_group
      FROM public.student_groups
      WHERE id = v_existing_group_id
      FOR UPDATE;

      DELETE FROM public.student_group_members
      WHERE student_erp = v_student_erp;

      PERFORM public.reassign_group_creator_if_needed(v_existing_group_id, v_student_erp, v_ta_email);
    END IF;

    INSERT INTO public.student_group_members (
      group_id,
      student_erp,
      added_by_erp,
      added_by_role
    )
    VALUES (
      v_group_id,
      v_student_erp,
      v_ta_email,
      'ta'
    )
    ON CONFLICT (student_erp) DO UPDATE SET
      group_id = EXCLUDED.group_id,
      added_by_erp = EXCLUDED.added_by_erp,
      added_by_role = EXCLUDED.added_by_role,
      updated_at = now();
  END LOOP;

  RETURN public.list_group_admin_state();
END;
$$;

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
      updated_at = now();

  RETURN public.list_group_admin_state();
END;
$$;

CREATE OR REPLACE FUNCTION public.ta_enable_group_editing_selected(p_group_numbers integer[])
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
  WHERE group_number = ANY(COALESCE(p_group_numbers, ARRAY[]::integer[]));

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
      updated_at = now();
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'updated_groups', v_updated,
    'deadline', p_deadline
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ta_set_group_edit_deadline_selected(p_group_numbers integer[], p_deadline timestamptz)
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
  WHERE group_number = ANY(COALESCE(p_group_numbers, ARRAY[]::integer[]));
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'updated_groups', v_updated,
    'deadline', p_deadline
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ta_create_group(integer, text, text[], timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ta_create_group(integer, text, text[], timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION public.ta_enable_group_editing_all() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ta_enable_group_editing_all() TO authenticated;

REVOKE ALL ON FUNCTION public.ta_enable_group_editing_selected(integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ta_enable_group_editing_selected(integer[]) TO authenticated;

REVOKE ALL ON FUNCTION public.ta_set_group_edit_deadline_all(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ta_set_group_edit_deadline_all(timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION public.ta_set_group_edit_deadline_selected(integer[], timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ta_set_group_edit_deadline_selected(integer[], timestamptz) TO authenticated;

COMMIT;
