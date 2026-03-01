import { supabase } from '@/integrations/supabase/client';
import { toAppError } from '@/shared/errors';
import type { RosterInsert, RosterRow, RosterUpdate } from './types';

const DUMMY_ID = '00000000-0000-0000-0000-000000000000';

export const listRoster = async (limit?: number): Promise<{ rows: RosterRow[]; count: number }> => {
  const query = supabase.from('students_roster').select('*', { count: 'exact' });
  const { data, error, count } = limit ? await query.limit(limit) : await query;

  if (error) {
    throw toAppError(error, 'roster_fetch_failed');
  }

  return {
    rows: (data ?? []) as RosterRow[],
    count: count ?? 0,
  };
};

export const replaceRoster = async (rows: RosterInsert[]): Promise<void> => {
  const { error: deleteError } = await supabase.from('students_roster').delete().neq('id', DUMMY_ID);
  if (deleteError) {
    throw toAppError(deleteError, 'roster_delete_failed');
  }

  const { error: insertError } = await supabase.from('students_roster').insert(rows);
  if (insertError) {
    throw toAppError(insertError, 'roster_insert_failed');
  }
};

export const createRosterStudent = async (input: RosterInsert): Promise<void> => {
  const { error } = await supabase.from('students_roster').insert([input]);
  if (error) {
    throw toAppError(error, 'roster_insert_failed');
  }
};

export const updateRosterStudent = async (id: string, input: RosterUpdate): Promise<void> => {
  const { error } = await supabase.from('students_roster').update(input).eq('id', id);
  if (error) {
    throw toAppError(error, 'roster_update_failed');
  }
};

export const deleteRosterStudent = async (id: string): Promise<void> => {
  const { error } = await supabase.from('students_roster').delete().eq('id', id);
  if (error) {
    throw toAppError(error, 'roster_delete_failed');
  }
};
