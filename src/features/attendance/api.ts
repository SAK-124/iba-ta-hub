import { supabase } from '@/integrations/supabase/client';
import { isObjectRecord, toNumberOr } from '@/shared/guards';
import { toAppError } from '@/shared/errors';
import type {
  AttendanceInsert,
  AttendanceHistoryRecord,
  AttendanceRow,
  AttendanceRowWithRoster,
  AttendanceStatus,
  AttendanceWithSessionNumber,
  RosterRow,
  RuleExceptionInsert,
  RuleExceptionRow,
  SessionRow,
  StudentAttendanceRecord,
  StudentAttendanceSummary,
} from './types';

const parseStudentAttendanceSummary = (value: unknown): StudentAttendanceSummary => {
  if (!isObjectRecord(value)) {
    return { records: [], total_absences: 0, total_naming_penalties: 0 };
  }

  const rawRecords = Array.isArray(value.records) ? value.records : [];
  const records: StudentAttendanceRecord[] = rawRecords
    .filter(isObjectRecord)
    .map((row) => ({
      session_number: toNumberOr(row.session_number),
      session_date: String(row.session_date ?? ''),
      day_of_week: String(row.day_of_week ?? ''),
      status: String(row.status ?? ''),
      naming_penalty: Boolean(row.naming_penalty),
    }));

  return {
    records,
    total_absences: toNumberOr(value.total_absences),
    total_naming_penalties: toNumberOr(value.total_naming_penalties),
  };
};

export const getStudentAttendanceSummary = async (studentErp: string): Promise<StudentAttendanceSummary> => {
  const { data, error } = await supabase.rpc('get_student_attendance', { student_erp: studentErp });
  if (error) {
    throw toAppError(error, 'attendance_fetch_failed');
  }

  return parseStudentAttendanceSummary(data);
};

export const listSessions = async (): Promise<SessionRow[]> => {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .order('session_number', { ascending: false });

  if (error) {
    throw toAppError(error, 'sessions_fetch_failed');
  }

  return (data ?? []) as SessionRow[];
};

export const listRoster = async (): Promise<RosterRow[]> => {
  const { data, error } = await supabase.from('students_roster').select('*');
  if (error) {
    throw toAppError(error, 'roster_fetch_failed');
  }

  return (data ?? []) as RosterRow[];
};

export const listAttendanceBySession = async (sessionId: string): Promise<AttendanceRowWithRoster[]> => {
  const { data, error } = await supabase
    .from('attendance')
    .select('*, students_roster(student_name, class_no)')
    .eq('session_id', sessionId);

  if (error) {
    throw toAppError(error, 'attendance_session_fetch_failed');
  }

  const rows = ((data ?? []) as AttendanceRowWithRoster[]).map((row) => ({
    ...row,
    student_name: row.students_roster?.student_name,
    class_no: row.students_roster?.class_no,
  }));

  return rows;
};

export const upsertAttendance = async (rows: AttendanceInsert[]): Promise<void> => {
  const { error } = await supabase
    .from('attendance')
    .upsert(rows, { onConflict: 'session_id,erp', ignoreDuplicates: true });

  if (error) {
    throw toAppError(error, 'attendance_upsert_failed');
  }
};

export const insertAttendance = async (rows: AttendanceInsert[]): Promise<void> => {
  const { error } = await supabase.from('attendance').insert(rows);
  if (error) {
    throw toAppError(error, 'attendance_insert_failed');
  }
};

export const deleteAttendanceBySession = async (sessionId: string): Promise<void> => {
  const { error } = await supabase.from('attendance').delete().eq('session_id', sessionId);
  if (error) {
    throw toAppError(error, 'attendance_delete_failed');
  }
};

export const updateAttendanceStatus = async (attendanceId: string, status: AttendanceStatus): Promise<void> => {
  const { error } = await supabase.from('attendance').update({ status }).eq('id', attendanceId);
  if (error) {
    throw toAppError(error, 'attendance_status_update_failed');
  }
};

export const updateAttendancePenalty = async (attendanceId: string, namingPenalty: boolean): Promise<void> => {
  const { error } = await supabase
    .from('attendance')
    .update({ naming_penalty: namingPenalty })
    .eq('id', attendanceId);

  if (error) {
    throw toAppError(error, 'attendance_penalty_update_failed');
  }
};

export const updateSessionZoomReport = async (
  sessionId: string,
  zoomReport: unknown,
  savedAtIso: string,
): Promise<void> => {
  const { error } = await supabase
    .from('sessions')
    .update({ zoom_report: zoomReport, zoom_report_saved_at: savedAtIso })
    .eq('id', sessionId);

  if (error) {
    throw toAppError(error, 'session_zoom_report_update_failed');
  }
};

export const listAttendanceWithSessionNumbers = async (): Promise<AttendanceWithSessionNumber[]> => {
  const { data, error } = await supabase.from('attendance').select('*, sessions(session_number)');
  if (error) {
    throw toAppError(error, 'attendance_fetch_failed');
  }

  return (data ?? []) as AttendanceWithSessionNumber[];
};

export const listAttendance = async (): Promise<AttendanceRow[]> => {
  const { data, error } = await supabase.from('attendance').select('*');
  if (error) {
    throw toAppError(error, 'attendance_fetch_failed');
  }

  return (data ?? []) as AttendanceRow[];
};

export const listAttendanceHistoryByErp = async (erp: string): Promise<AttendanceHistoryRecord[]> => {
  const { data, error } = await supabase
    .from('attendance')
    .select(`
      session_id,
      status,
      sessions!inner (
        session_number,
        session_date,
        day_of_week
      )
    `)
    .eq('erp', erp)
    .order('sessions(session_number)', { ascending: true });

  if (error) {
    throw toAppError(error, 'attendance_history_fetch_failed');
  }

  const rows = (data ?? []) as Array<{
    session_id: string;
    status: string;
    sessions: {
      session_number: number;
      session_date: string;
      day_of_week: string;
    };
  }>;

  return rows.map((row) => ({
    session_id: row.session_id,
    session_number: row.sessions.session_number,
    session_date: row.sessions.session_date,
    day_of_week: row.sessions.day_of_week,
    status: row.status,
  }));
};

export const listRuleExceptions = async (): Promise<RuleExceptionRow[]> => {
  const { data, error } = await supabase.from('rule_exceptions').select('*').order('created_at', { ascending: false });
  if (error) {
    throw toAppError(error, 'rule_exceptions_fetch_failed');
  }

  return (data ?? []) as RuleExceptionRow[];
};

export const createRuleException = async (input: RuleExceptionInsert): Promise<void> => {
  const { error } = await supabase.from('rule_exceptions').insert(input);
  if (error) {
    throw toAppError(error, 'rule_exception_create_failed');
  }
};

export const deleteRuleException = async (id: string): Promise<void> => {
  const { error } = await supabase.from('rule_exceptions').delete().eq('id', id);
  if (error) {
    throw toAppError(error, 'rule_exception_delete_failed');
  }
};
