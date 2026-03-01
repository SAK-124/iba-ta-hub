import { supabase } from '@/integrations/supabase/client';
import type { PublicAttendanceBoardData, PublicAttendancePenaltyEntry, PublicAttendanceStudent } from '@/lib/public-attendance-sync';

export const TEST_STUDENT_ERP = '00000';

type TestStudentOverrides = Partial<PublicAttendanceStudent> & {
  [key: string]: unknown;
};

export interface TaTestStudentSettings {
  showInTa: boolean;
  overrides: TestStudentOverrides;
}

interface RosterStudentLike {
  class_no: string;
  student_name: string;
  erp: string;
  id?: string;
  [key: string]: unknown;
}

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const toText = (value: unknown, fallback = '') => {
  if (value == null) {
    return fallback;
  }

  return String(value);
};

const toNonNegativeNumber = (value: unknown, fallback = 0) => {
  const next = Number(value);
  if (!Number.isFinite(next)) {
    return fallback;
  }

  return Math.max(0, next);
};

const normalizeSessionStatus = (value: unknown): Record<string, string> => {
  if (!isObjectRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, string>>((acc, [key, rawStatus]) => {
    if (typeof rawStatus === 'string') {
      acc[String(key)] = rawStatus;
    }
    return acc;
  }, {});
};

const normalizePenaltyEntries = (value: unknown): PublicAttendancePenaltyEntry[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!isObjectRecord(entry)) {
        return null;
      }

      const sessionId = toText(entry.session_id, '').trim();
      if (!sessionId) {
        return null;
      }

      return {
        session_id: sessionId,
        session_number: toNonNegativeNumber(entry.session_number, 0),
        session_date: toText(entry.session_date),
        day_of_week: toText(entry.day_of_week),
        details: isObjectRecord(entry.details) ? entry.details : null,
      };
    })
    .filter((entry): entry is PublicAttendancePenaltyEntry => entry !== null)
    .sort((a, b) => a.session_number - b.session_number);
};

const buildTestStudent = (
  overrides: TestStudentOverrides,
  existing?: PublicAttendanceStudent
): PublicAttendanceStudent => {
  const base = existing ?? {
    class_no: 'TEST',
    student_name: 'Test Student',
    erp: TEST_STUDENT_ERP,
    total_penalties: 0,
    total_absences: 0,
    session_status: {},
    penalty_entries: [],
  };

  return {
    class_no: toText(overrides.class_no, base.class_no),
    student_name: toText(overrides.student_name, base.student_name),
    erp: TEST_STUDENT_ERP,
    total_penalties: toNonNegativeNumber(overrides.total_penalties, base.total_penalties),
    total_absences: toNonNegativeNumber(overrides.total_absences, base.total_absences),
    session_status:
      overrides.session_status === undefined
        ? base.session_status
        : normalizeSessionStatus(overrides.session_status),
    penalty_entries:
      overrides.penalty_entries === undefined
        ? base.penalty_entries
        : normalizePenaltyEntries(overrides.penalty_entries),
  };
};

export const fetchTaTestStudentSettings = async (): Promise<TaTestStudentSettings> => {
  const { data, error } = await supabase
    .from('app_settings')
    .select('show_test_student_in_ta, test_student_overrides')
    .single();

  if (error) {
    throw error;
  }

  const rawOverrides = isObjectRecord(data?.test_student_overrides) ? (data.test_student_overrides as TestStudentOverrides) : {};

  return {
    showInTa: Boolean(data?.show_test_student_in_ta),
    overrides: rawOverrides,
  };
};

export const applyTaTestStudentToBoard = (
  board: PublicAttendanceBoardData,
  settings: TaTestStudentSettings
): PublicAttendanceBoardData => {
  const nonTestStudents = board.students.filter((student) => student.erp !== TEST_STUDENT_ERP);

  if (!settings.showInTa) {
    return {
      ...board,
      students: nonTestStudents,
    };
  }

  const existingTestStudent = board.students.find((student) => student.erp === TEST_STUDENT_ERP);
  const testStudent = buildTestStudent(settings.overrides, existingTestStudent);

  const students = [...nonTestStudents, testStudent].sort((a, b) => {
    const classCompare = a.class_no.localeCompare(b.class_no, undefined, { numeric: true, sensitivity: 'base' });
    if (classCompare !== 0) return classCompare;
    return a.student_name.localeCompare(b.student_name, undefined, { sensitivity: 'base' });
  });

  return {
    ...board,
    students,
  };
};

export const applyTaTestStudentToRoster = <T extends RosterStudentLike>(
  rosterRows: T[],
  settings: TaTestStudentSettings
): T[] => {
  const nonTestRows = rosterRows.filter((row) => row.erp !== TEST_STUDENT_ERP);

  if (!settings.showInTa) {
    return nonTestRows;
  }

  const existingTestRow = rosterRows.find((row) => row.erp === TEST_STUDENT_ERP);
  const classNo = toText(settings.overrides.class_no, existingTestRow?.class_no ?? 'TEST');
  const studentName = toText(settings.overrides.student_name, existingTestRow?.student_name ?? 'Test Student');

  const mergedTestRow: T = {
    ...(existingTestRow ?? ({} as T)),
    class_no: classNo,
    student_name: studentName,
    erp: TEST_STUDENT_ERP,
  };

  const rows = [...nonTestRows, mergedTestRow].sort((a, b) => {
    const classCompare = String(a.class_no).localeCompare(String(b.class_no), undefined, { numeric: true, sensitivity: 'base' });
    if (classCompare !== 0) return classCompare;
    return String(a.student_name).localeCompare(String(b.student_name), undefined, { sensitivity: 'base' });
  });

  return rows;
};
