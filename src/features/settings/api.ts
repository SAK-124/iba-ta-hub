import { supabase } from '@/integrations/supabase/client';
import { toAppError } from '@/shared/errors';
import type {
  AppSettingsRow,
  AppSettingsUpdate,
  IssueFormOptions,
  SubmissionInsert,
  SubmissionRow,
  TaAllowlistInsert,
  TaAllowlistRow,
} from './types';

export const getAppSettings = async (): Promise<AppSettingsRow> => {
  const { data, error } = await supabase.from('app_settings').select('*').single();
  if (error || !data) {
    throw toAppError(error, 'app_settings_fetch_failed');
  }

  return data;
};

export const updateAppSettings = async (id: string, input: AppSettingsUpdate): Promise<void> => {
  const { error } = await supabase.from('app_settings').update(input).eq('id', id);
  if (error) {
    throw toAppError(error, 'app_settings_update_failed');
  }
};

export const listTaAllowlist = async (activeOnly = true): Promise<TaAllowlistRow[]> => {
  let query = supabase.from('ta_allowlist').select('id, email, active, created_at').order('email');
  if (activeOnly) {
    query = query.eq('active', true);
  }

  const { data, error } = await query;
  if (error) {
    throw toAppError(error, 'ta_allowlist_fetch_failed');
  }

  return (data ?? []) as TaAllowlistRow[];
};

export const addTaAllowlistEmail = async (input: TaAllowlistInsert): Promise<void> => {
  const { error } = await supabase.from('ta_allowlist').insert(input);
  if (error) {
    throw toAppError(error, 'ta_allowlist_insert_failed');
  }
};

export const deactivateTaAllowlistEmail = async (id: string): Promise<void> => {
  const { error } = await supabase.from('ta_allowlist').update({ active: false }).eq('id', id);
  if (error) {
    throw toAppError(error, 'ta_allowlist_update_failed');
  }
};

export const deleteTaAllowlistEmail = async (id: string): Promise<void> => {
  const { error } = await supabase.from('ta_allowlist').delete().eq('id', id);
  if (error) {
    throw toAppError(error, 'ta_allowlist_delete_failed');
  }
};

export const listSubmissions = async (activeOnly = true): Promise<SubmissionRow[]> => {
  let query = supabase.from('submissions_list').select('*').order('sort_order');
  if (activeOnly) {
    query = query.eq('active', true);
  }

  const { data, error } = await query;
  if (error) {
    throw toAppError(error, 'submissions_fetch_failed');
  }

  return (data ?? []) as SubmissionRow[];
};

export const addSubmission = async (input: SubmissionInsert): Promise<void> => {
  const { error } = await supabase.from('submissions_list').insert(input);
  if (error) {
    throw toAppError(error, 'submission_insert_failed');
  }
};

export const deactivateSubmission = async (id: string): Promise<void> => {
  const { error } = await supabase.from('submissions_list').update({ active: false }).eq('id', id);
  if (error) {
    throw toAppError(error, 'submission_update_failed');
  }
};

export const deleteSubmission = async (id: string): Promise<void> => {
  const { error } = await supabase.from('submissions_list').delete().eq('id', id);
  if (error) {
    throw toAppError(error, 'submission_delete_failed');
  }
};

export const fetchIssueFormOptions = async (): Promise<IssueFormOptions> => {
  const [subsResponse, penaltiesResponse, sessionsResponse] = await Promise.all([
    supabase.from('submissions_list').select('id, label').eq('active', true).order('sort_order'),
    supabase.from('penalty_types').select('id, label').eq('active', true),
    supabase.from('sessions').select('id, session_number, session_date').order('session_number', { ascending: false }),
  ]);

  if (subsResponse.error) {
    throw toAppError(subsResponse.error, 'submissions_fetch_failed');
  }
  if (penaltiesResponse.error) {
    throw toAppError(penaltiesResponse.error, 'penalty_types_fetch_failed');
  }
  if (sessionsResponse.error) {
    throw toAppError(sessionsResponse.error, 'sessions_fetch_failed');
  }

  return {
    submissions: (subsResponse.data ?? []).map((item) => ({ id: item.id, label: item.label })),
    penaltyTypes: (penaltiesResponse.data ?? []).map((item) => ({ id: item.id, label: item.label })),
    sessions: (sessionsResponse.data ?? []).map((item) => ({
      id: item.id,
      session_number: item.session_number,
      session_date: item.session_date,
    })),
  };
};

export const getMyTaPassword = async (): Promise<string | null> => {
  const { data, error } = await supabase.rpc('get_my_ta_password');
  if (error) {
    throw toAppError(error, 'ta_password_fetch_failed');
  }

  return (data as string | null) ?? null;
};

export const setMyTaPassword = async (newPassword: string): Promise<void> => {
  const { error: authError } = await supabase.auth.updateUser({ password: newPassword });
  if (authError) {
    throw toAppError(authError, 'ta_password_auth_update_failed');
  }

  const { error } = await supabase.rpc('set_my_ta_password', { new_password: newPassword });
  if (error) {
    throw toAppError(error, 'ta_password_sync_failed');
  }
};
