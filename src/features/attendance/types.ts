import type { TableInsert, TableRow, TableUpdate } from '@/shared/supabase-types';

export type AttendanceStatus = 'present' | 'absent' | 'excused';

export type AttendanceRow = TableRow<'attendance'>;
export type AttendanceInsert = TableInsert<'attendance'>;
export type AttendanceUpdate = TableUpdate<'attendance'>;

export type SessionRow = TableRow<'sessions'>;
export type SessionInsert = TableInsert<'sessions'>;
export type SessionUpdate = TableUpdate<'sessions'>;

export type RosterRow = TableRow<'students_roster'>;
export type RuleExceptionRow = TableRow<'rule_exceptions'>;
export type RuleExceptionInsert = TableInsert<'rule_exceptions'>;

export interface StudentAttendanceRecord {
  session_id?: string;
  session_number: number;
  session_date: string;
  day_of_week: string;
  status: string;
  naming_penalty: boolean;
  details_available?: boolean;
  source_type?: string;
  session_start_time?: string | null;
  session_end_time?: string | null;
  official_minutes?: number | null;
  effective_minutes?: number | null;
  namaz_break_minutes?: number | null;
  attended_minutes?: number | null;
  required_minutes?: number | null;
  shortfall_minutes?: number | null;
  zoom_names?: string | null;
  name_format?: string | null;
  match_method?: string | null;
  explanation_code?: string;
}

export interface AttendanceHistoryRecord {
  session_id: string;
  session_number: number;
  session_date: string;
  day_of_week: string;
  status: string;
}

export interface StudentAttendanceSummary {
  records: StudentAttendanceRecord[];
  total_absences: number;
  total_naming_penalties: number;
}

export interface AttendanceRowWithRoster extends AttendanceRow {
  students_roster?: {
    student_name?: string;
    class_no?: string;
  } | null;
  student_name?: string;
  class_no?: string;
}

export interface AttendanceWithSessionNumber extends AttendanceRow {
  sessions?: {
    session_number?: number;
  } | null;
}
