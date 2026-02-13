-- Backfill attendance rows for newly-added roster students.
-- Scope: sessions that already have attendance rows ("marked sessions" only).

CREATE OR REPLACE FUNCTION public.backfill_attendance_for_erp(target_erp text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer := 0;
BEGIN
  IF target_erp IS NULL OR btrim(target_erp) = '' THEN
    RETURN 0;
  END IF;

  WITH marked_sessions AS (
    SELECT DISTINCT a.session_id
    FROM public.attendance a
  ),
  inserted AS (
    INSERT INTO public.attendance (session_id, erp, status, naming_penalty)
    SELECT ms.session_id, target_erp, 'absent', false
    FROM marked_sessions ms
    ON CONFLICT (session_id, erp) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO inserted_count
  FROM inserted;

  RETURN COALESCE(inserted_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_roster_insert_backfill()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.backfill_attendance_for_erp(NEW.erp);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_students_roster_backfill_attendance ON public.students_roster;

CREATE TRIGGER trg_students_roster_backfill_attendance
AFTER INSERT ON public.students_roster
FOR EACH ROW
EXECUTE FUNCTION public.handle_roster_insert_backfill();

-- One-time repair for existing data:
-- ensure every current roster ERP has an attendance row for every already-marked session.
WITH marked_sessions AS (
  SELECT DISTINCT a.session_id
  FROM public.attendance a
),
roster_erps AS (
  SELECT r.erp
  FROM public.students_roster r
),
missing_pairs AS (
  SELECT ms.session_id, re.erp
  FROM marked_sessions ms
  CROSS JOIN roster_erps re
  LEFT JOIN public.attendance a
    ON a.session_id = ms.session_id
   AND a.erp = re.erp
  WHERE a.id IS NULL
)
INSERT INTO public.attendance (session_id, erp, status, naming_penalty)
SELECT mp.session_id, mp.erp, 'absent', false
FROM missing_pairs mp
ON CONFLICT (session_id, erp) DO NOTHING;
