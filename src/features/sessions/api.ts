import { supabase } from '@/integrations/supabase/client';
import { toAppError } from '@/shared/errors';
import type { CreateSessionInput, SessionRow, UpdateSessionInput } from './types';

export const listSessions = async (): Promise<SessionRow[]> => {
  const { data, error } = await supabase.from('sessions').select('*').order('session_number', { ascending: false });
  if (error) {
    throw toAppError(error, 'sessions_fetch_failed');
  }

  return (data ?? []) as SessionRow[];
};

export const createSession = async (input: CreateSessionInput): Promise<void> => {
  const { error } = await supabase.from('sessions').insert(input);
  if (error) {
    throw toAppError(error, 'session_create_failed');
  }
};

export const updateSession = async (sessionId: string, input: UpdateSessionInput): Promise<void> => {
  const { error } = await supabase.from('sessions').update(input).eq('id', sessionId);
  if (error) {
    throw toAppError(error, 'session_update_failed');
  }
};

export const deleteSession = async (sessionId: string): Promise<void> => {
  const { error } = await supabase.from('sessions').delete().eq('id', sessionId);
  if (error) {
    throw toAppError(error, 'session_delete_failed');
  }
};
