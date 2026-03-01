import type { Json, TableInsert, TableRow, TableUpdate } from '@/shared/supabase-types';

export type AppSettingsRow = TableRow<'app_settings'>;
export type AppSettingsUpdate = TableUpdate<'app_settings'>;

export type TaAllowlistRow = TableRow<'ta_allowlist'>;
export type TaAllowlistInsert = TableInsert<'ta_allowlist'>;

export type SubmissionRow = TableRow<'submissions_list'>;
export type SubmissionInsert = TableInsert<'submissions_list'>;

export type PenaltyTypeRow = TableRow<'penalty_types'>;

export interface IssueFormOptions {
  submissions: Pick<SubmissionRow, 'id' | 'label'>[];
  penaltyTypes: Pick<PenaltyTypeRow, 'id' | 'label'>[];
  sessions: Pick<TableRow<'sessions'>, 'id' | 'session_number' | 'session_date'>[];
}

export interface TestStudentOverrides {
  class_no: string;
  student_name: string;
  total_absences: number;
  total_penalties: number;
  session_status: Record<string, string>;
  penalty_entries: Json[];
}
