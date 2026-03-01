import type { TableInsert, TableRow, TableUpdate } from '@/shared/supabase-types';

export type RosterRow = TableRow<'students_roster'>;
export type RosterInsert = TableInsert<'students_roster'>;
export type RosterUpdate = TableUpdate<'students_roster'>;
