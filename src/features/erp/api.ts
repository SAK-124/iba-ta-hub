import { supabase } from '@/integrations/supabase/client';
import { toAppError } from '@/shared/errors';

export const checkRoster = async (erp: string): Promise<{ found: boolean; student_name?: string; class_no?: string }> => {
  const { data, error } = await supabase.rpc('check_roster', { check_erp: erp });
  if (error) {
    throw toAppError(error, 'erp_roster_check_failed');
  }

  const result = (data ?? {}) as { found?: boolean; student_name?: string; class_no?: string };
  return {
    found: Boolean(result.found),
    student_name: result.student_name,
    class_no: result.class_no,
  };
};
