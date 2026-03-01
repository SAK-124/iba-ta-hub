import type { TableInsert, TableRow, TableUpdate } from '@/shared/supabase-types';

export type SessionRow = TableRow<'sessions'>;
export type SessionInsert = TableInsert<'sessions'>;
export type SessionUpdate = TableUpdate<'sessions'>;

export interface CreateSessionInput {
  session_number: number;
  session_date: string;
  day_of_week: string;
  start_time?: string;
  end_time?: string;
}

export interface UpdateSessionInput {
  session_number: number;
  session_date: string;
  day_of_week: string;
  start_time: string | null;
  end_time: string | null;
}
