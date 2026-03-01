import { supabase } from '@/integrations/supabase/client';
import { toAppError } from '@/shared/errors';
import type { RosterReference } from './types';

export const listRosterReference = async (): Promise<RosterReference[]> => {
  const { data, error } = await supabase.from('students_roster').select('erp, student_name, class_no');
  if (error) {
    throw toAppError(error, 'zoom_roster_fetch_failed');
  }

  return (data ?? []) as RosterReference[];
};

export const getCurrentSessionEmail = async (): Promise<string | null> => {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw toAppError(error, 'auth_session_fetch_failed');
  }

  return data.session?.user?.email ?? null;
};
