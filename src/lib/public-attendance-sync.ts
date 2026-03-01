import { supabase } from '@/integrations/supabase/client';
import { saveToGoogleSheet } from '@/lib/google-sheets';

export const PUBLIC_ATTENDANCE_SHEET_NAME = 'Public Attendance Snapshot';

export interface PublicAttendanceSession {
  id: string;
  session_number: number;
  session_date: string;
  day_of_week: string;
}

export interface PublicAttendancePenaltyDetails {
  rejoin_count?: number;
  session_durations_minutes?: number[];
  total_duration_minutes?: number;
  missed_minutes_for_presence?: number;
  [key: string]: unknown;
}

export interface PublicAttendancePenaltyEntry {
  session_id: string;
  session_number: number;
  session_date: string;
  day_of_week: string;
  details: PublicAttendancePenaltyDetails | null;
}

export interface PublicAttendanceStudent {
  class_no: string;
  student_name: string;
  erp: string;
  total_penalties: number;
  total_absences: number;
  session_status: Record<string, string>;
  penalty_entries: PublicAttendancePenaltyEntry[];
}

export interface PublicAttendanceBoardData {
  sessions: PublicAttendanceSession[];
  students: PublicAttendanceStudent[];
}

export interface PublicAttendanceSnapshotPayload {
  type: 'public_attendance_snapshot';
  target_sheet: string;
  generated_at: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  metadata: {
    students: number;
    sessions: number;
    source: string;
  };
}

const toText = (value: unknown) => (value == null ? '' : String(value));

const toNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toObjectOrNull = (value: unknown): Record<string, unknown> | null => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
};

const statusToSymbol = (status: string | undefined) => {
  if (status === 'present') return 'P';
  if (status === 'absent') return 'A';
  if (status === 'excused') return 'E';
  return '-';
};

export const normalizePublicAttendanceBoardData = (payload: unknown): PublicAttendanceBoardData => {
  const raw = (payload ?? {}) as Partial<PublicAttendanceBoardData>;

  const sessions = (Array.isArray(raw.sessions) ? raw.sessions : [])
    .map((session) => ({
      id: toText((session as PublicAttendanceSession).id),
      session_number: toNumber((session as PublicAttendanceSession).session_number),
      session_date: toText((session as PublicAttendanceSession).session_date),
      day_of_week: toText((session as PublicAttendanceSession).day_of_week),
    }))
    .filter((session) => session.id !== '')
    .sort((a, b) => a.session_number - b.session_number);

  const students = (Array.isArray(raw.students) ? raw.students : [])
    .map((student) => ({
      class_no: toText((student as PublicAttendanceStudent).class_no),
      student_name: toText((student as PublicAttendanceStudent).student_name),
      erp: toText((student as PublicAttendanceStudent).erp),
      total_penalties: toNumber((student as PublicAttendanceStudent).total_penalties),
      total_absences: toNumber((student as PublicAttendanceStudent).total_absences),
      session_status:
        (student as PublicAttendanceStudent).session_status &&
        typeof (student as PublicAttendanceStudent).session_status === 'object'
          ? ((student as PublicAttendanceStudent).session_status as Record<string, string>)
          : {},
      penalty_entries: (Array.isArray((student as PublicAttendanceStudent).penalty_entries)
        ? (student as PublicAttendanceStudent).penalty_entries
        : []
      )
        .map((entry) => ({
          session_id: toText((entry as PublicAttendancePenaltyEntry).session_id),
          session_number: toNumber((entry as PublicAttendancePenaltyEntry).session_number),
          session_date: toText((entry as PublicAttendancePenaltyEntry).session_date),
          day_of_week: toText((entry as PublicAttendancePenaltyEntry).day_of_week),
          details: toObjectOrNull((entry as PublicAttendancePenaltyEntry).details) as PublicAttendancePenaltyDetails | null,
        }))
        .filter((entry) => entry.session_id !== '')
        .sort((a, b) => a.session_number - b.session_number),
    }))
    .filter((student) => student.erp !== '');

  return { sessions, students };
};

export const fetchPublicAttendanceBoard = async (): Promise<PublicAttendanceBoardData> => {
  const { data, error } = await supabase.rpc('get_public_attendance_board' as never);

  if (error) {
    throw error;
  }

  return normalizePublicAttendanceBoardData(data);
};

interface PenaltyAttendanceRow {
  erp: string;
  session_id: string;
  sessions:
    | {
        session_number: number;
        session_date: string;
        day_of_week: string;
      }
    | Array<{
        session_number: number;
        session_date: string;
        day_of_week: string;
      }>
    | null;
}

export const fetchPenaltyEntriesForErps = async (
  erps: string[]
): Promise<Record<string, PublicAttendancePenaltyEntry[]>> => {
  const uniqueErps = Array.from(new Set(erps.map((erp) => erp.trim()).filter(Boolean)));

  if (uniqueErps.length === 0) {
    return {};
  }

  const { data, error } = await supabase
    .from('attendance')
    .select('erp, session_id, sessions(session_number, session_date, day_of_week)')
    .eq('naming_penalty', true)
    .in('erp', uniqueErps);

  if (error) {
    throw error;
  }

  const grouped: Record<string, PublicAttendancePenaltyEntry[]> = {};

  for (const row of (data ?? []) as PenaltyAttendanceRow[]) {
    const sessionRef = Array.isArray(row.sessions) ? row.sessions[0] : row.sessions;
    if (!sessionRef) {
      continue;
    }

    const entry: PublicAttendancePenaltyEntry = {
      session_id: toText(row.session_id),
      session_number: toNumber(sessionRef.session_number),
      session_date: toText(sessionRef.session_date),
      day_of_week: toText(sessionRef.day_of_week),
      details: null,
    };

    if (!entry.session_id || !row.erp) {
      continue;
    }

    const erp = toText(row.erp);
    grouped[erp] = grouped[erp] ?? [];
    grouped[erp].push(entry);
  }

  for (const erp of Object.keys(grouped)) {
    grouped[erp] = grouped[erp]
      .sort((a, b) => a.session_number - b.session_number)
      .filter((entry, index, arr) => index === 0 || arr[index - 1].session_id !== entry.session_id);
  }

  return grouped;
};

export const buildPublicAttendanceSnapshotPayload = (
  board: PublicAttendanceBoardData,
  source = 'portal_sync'
): PublicAttendanceSnapshotPayload => {
  const headers = ['Class', 'Name', 'ERP', 'Penalties', 'Absences', ...board.sessions.map((session) => `S${session.session_number}`)];

  const rows = board.students.map((student) => [
    student.class_no,
    student.student_name,
    student.erp,
    Number(student.total_penalties || 0),
    Number(student.total_absences || 0),
    ...board.sessions.map((session) => statusToSymbol(student.session_status?.[session.id])),
  ]);

  return {
    type: 'public_attendance_snapshot',
    target_sheet: PUBLIC_ATTENDANCE_SHEET_NAME,
    generated_at: new Date().toISOString(),
    headers,
    rows,
    metadata: {
      students: board.students.length,
      sessions: board.sessions.length,
      source,
    },
  };
};

export const syncPublicAttendanceSnapshot = async (options?: { source?: string }) => {
  const board = await fetchPublicAttendanceBoard();
  const payload = buildPublicAttendanceSnapshotPayload(board, options?.source ?? 'portal_sync');
  const ok = await saveToGoogleSheet(payload);

  return { ok, payload, board };
};
