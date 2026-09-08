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
      session_id: typeof row.session_id === 'string' ? row.session_id : undefined,
      session_number: toNumberOr(row.session_number),
      session_date: String(row.session_date ?? ''),
      day_of_week: String(row.day_of_week ?? ''),
      status: String(row.status ?? ''),
      naming_penalty: row.naming_penalty === true || ['true', '1', 'yes'].includes(String(row.naming_penalty ?? '').toLowerCase()),
      details_available: typeof row.details_available === 'boolean' ? row.details_available : undefined,
      source_type: typeof row.source_type === 'string' ? row.source_type : undefined,
      session_start_time: typeof row.session_start_time === 'string' ? row.session_start_time : null,
      session_end_time: typeof row.session_end_time === 'string' ? row.session_end_time : null,
      official_minutes: row.official_minutes == null ? null : toNumberOr(row.official_minutes),
      effective_minutes: row.effective_minutes == null ? null : toNumberOr(row.effective_minutes),
      namaz_break_minutes: row.namaz_break_minutes == null ? null : toNumberOr(row.namaz_break_minutes),
      attended_minutes: row.attended_minutes == null ? null : toNumberOr(row.attended_minutes),
      required_minutes: row.required_minutes == null ? null : toNumberOr(row.required_minutes),
      shortfall_minutes: row.shortfall_minutes == null ? null : toNumberOr(row.shortfall_minutes),
      zoom_names: typeof row.zoom_names === 'string' ? row.zoom_names : null,
      name_format: typeof row.name_format === 'string' ? row.name_format : null,
      match_method: typeof row.match_method === 'string' ? row.match_method : null,
      explanation_code: typeof row.explanation_code === 'string' ? row.explanation_code : undefined,
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
  const summary = await getStudentAttendanceSummary(erp);
  return summary.records.map((record) => ({
    session_id: record.session_id ?? `session-${record.session_number}`,
    session_number: record.session_number,
    session_date: record.session_date,
    day_of_week: record.day_of_week,
    status: record.status,
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
