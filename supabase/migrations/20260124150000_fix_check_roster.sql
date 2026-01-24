-- Fix or Create check_roster RPC
CREATE OR REPLACE FUNCTION public.check_roster(check_erp text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  found_student record;
BEGIN
  -- Trim whitespace
  check_erp := trim(check_erp);
  
  SELECT * INTO found_student FROM public.students_roster WHERE erp ILIKE check_erp LIMIT 1;
  
  IF found_student IS NOT NULL THEN
    RETURN jsonb_build_object('found', true, 'student_name', found_student.student_name, 'class_no', found_student.class_no);
  ELSE
    RETURN jsonb_build_object('found', false);
  END IF;
END;
$$;
