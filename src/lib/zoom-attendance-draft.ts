import type { ZoomSessionReport } from '@/lib/zoom-session-report';
import type { AttendanceStatus } from '@/features/attendance';

export interface AttendanceDraftStudent {
  erp: string;
  student_name: string;
  class_no: string;
}

export interface AttendanceDraftRow extends AttendanceDraftStudent {
  id: string;
  session_id: string;
  status: AttendanceStatus;
  naming_penalty: boolean;
  created_at: string;
}

const isStatus = (value: unknown): value is AttendanceStatus =>
  value === 'present' || value === 'absent' || value === 'excused';

const isPenalty = (value: unknown) =>
  value === true || value === -1 || String(value ?? '').trim() === '-1';

export const zoomReportMatchesSession = (report: ZoomSessionReport, sessionId: string) =>
  !report.session_id || report.session_id === sessionId;

/** Build an editable, non-persisted attendance draft from a reviewed Zoom report. */
export const buildZoomAttendanceDraft = (
  report: ZoomSessionReport,
  roster: AttendanceDraftStudent[],
  sessionId: string,
): AttendanceDraftRow[] => {
  const reportRows = new Map(
    report.attendance_rows.map((row) => [String(row.ERP ?? row.erp ?? '').trim(), row]),
  );
  const createdAt = new Date().toISOString();

  return roster.map((student) => {
    const row = reportRows.get(student.erp);
    const statusValue = String(row?.Status ?? row?.status ?? '').toLowerCase();
    const status = isStatus(statusValue) ? statusValue : 'absent';
    const penaltyValue = row?.['Name Penalty'] ?? row?.['Naming Penalty'] ?? row?.naming_penalty;
    return {
      ...student,
      id: `zoom-draft-${sessionId}-${student.erp}`,
      session_id: sessionId,
      status,
      naming_penalty: status === 'present' && isPenalty(penaltyValue),
      created_at: createdAt,
    };
  });
};
