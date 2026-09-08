import { describe, expect, it } from 'vitest';
import {
  isValidZoomDisplayName,
  getZoomResolutionSuggestions,
  getZoomTimingSummary,
  parseZoomDisplayIdentity,
  parseZoomCsv,
  processZoomAttendance,
  processZoomCsv,
  validateZoomQuickAdd,
  type ZoomParticipantRecord,
  type ZoomRosterStudent,
} from '@/lib/zoom-processor';
import { buildZoomAttendanceDraft, zoomReportMatchesSession } from '@/lib/zoom-attendance-draft';
import type { ZoomSessionReport } from '@/lib/zoom-session-report';

const roster: ZoomRosterStudent[] = [
  { erp: '12345', student_name: 'Ali Asghar', class_no: '101809' },
  { erp: '23456', student_name: 'Sara Khan', class_no: '101809' },
  { erp: '34567', student_name: 'Noor Ahmed', class_no: '101810' },
];

const participant = (name: string, join: string, leave: string): ZoomParticipantRecord => ({
  name,
  joinTime: `09/03/2026 ${join}`,
  leaveTime: `09/03/2026 ${leave}`,
});

describe('zoom processor', () => {
  it('parses Zoom metadata followed by the participant table', () => {
    const csv = [
      'Topic,ID,Duration (minutes),Start time,End time,Participants',
      'Class,1,77,"09/03/2026 08:30:26 AM","09/03/2026 09:46:50 AM",2',
      '',
      'Name (original name),Email,Join time,Leave time,Duration (minutes)',
      '12345_Ali Asghar,,"09/03/2026 08:30:00 AM","09/03/2026 09:30:00 AM",60',
    ].join('\n');

    const rows = parseZoomCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('12345_Ali Asghar');
    expect(rows[0].durationMinutes).toBe(60);
  });

  it('clips to the official window, merges rejoins, and subtracts the break', () => {
    const result = processZoomAttendance(
      [
        participant('12345_Ali', '08:20:00 AM', '08:50:00 AM'),
        participant('12345_Ali', '08:45:00 AM', '09:20:00 AM'),
        participant('23456_Sara', '08:30:00 AM', '08:50:00 AM'),
      ],
      roster,
      {
        sessionDate: '2026-09-03',
        startTime: '08:30',
        endTime: '09:00',
        namazBreakMinutes: 5,
      },
    );

    // 30 minutes after clipping (08:30-09:00, with the overlap merged), not 65.
    expect(result.attendance_rows[0]['Attended Minutes']).toBe(30);
    expect(result.total_class_minutes).toBe(30);
    expect(result.effective_class_minutes).toBe(25);
    expect(result.effective_threshold_minutes).toBe(20);
    expect(result.attendance_rows[0].Status).toBe('present');
    expect(result.attendance_rows[1].Status).toBe('present');
  });

  it('uses a manual duration to ignore overtime after the official class', () => {
    const result = processZoomAttendance(
      [participant('12345_Ali', '08:30:00 AM', '10:00:00 AM')],
      roster,
      { sessionDate: '2026-09-03', startTime: '08:30', endTime: '10:00', manualDurationMinutes: 30 },
    );

    expect(result.total_class_minutes).toBe(30);
    expect(result.attendance_rows[0]['Attended Minutes']).toBe(30);
  });

  it('caps displayed attendance percentage at 100 when the effective denominator is reduced', () => {
    const result = processZoomAttendance(
      [participant('12345_Ali', '08:30:00 AM', '09:30:00 AM')],
      roster,
      { sessionDate: '2026-09-03', startTime: '08:30', endTime: '09:30', namazBreakMinutes: 30 },
    );
    expect(result.attendance_rows[0]['Attended Minutes']).toBe(60);
    expect(result.effective_class_minutes).toBe(30);
    expect(result.attendance_rows[0]['Attendance %']).toBe(100);
  });

  it('applies a penalty only to present students with an invalid display name', () => {
    const result = processZoomAttendance(
      [
        participant('12345_Ali', '08:30:00 AM', '09:30:00 AM'),
        participant('23456', '08:30:00 AM', '08:35:00 AM'),
        participant('34567_Someone', '08:30:00 AM', '09:30:00 AM'),
      ],
      roster,
      { sessionDate: '2026-09-03', startTime: '08:30', endTime: '09:30' },
    );

    expect(result.attendance_rows.map((row) => row.Status)).toEqual(['present', 'absent', 'present']);
    expect(result.attendance_rows.map((row) => row['Name Penalty'])).toEqual([0, 0, 0]);

    const invalid = processZoomAttendance(
      [participant('Ali Asghar', '08:30:00 AM', '09:30:00 AM')],
      roster,
      { sessionDate: '2026-09-03', startTime: '08:30', endTime: '09:30' },
    );
    expect(invalid.attendance_rows[0]['Name Penalty']).toBe(-1);
  });

  it('matches by ERP first, matches an exact roster name, and reports unknown participants', () => {
    const result = processZoomAttendance(
      [
        participant('12345_Wrong Name', '08:30:00 AM', '09:30:00 AM'),
        participant('Sara Khan', '08:30:00 AM', '09:30:00 AM'),
        participant('99999_Unknown', '08:30:00 AM', '09:30:00 AM'),
      ],
      roster,
      { sessionDate: '2026-09-03', startTime: '08:30', endTime: '09:30' },
    );

    expect(result.attendance_rows[0]['Match Method']).toBe('ERP');
    expect(result.attendance_rows[1]['Match Method']).toBe('Name');
    expect(result.issues_rows[0].Reason).toBe('ERP not found in roster');
  });

  it('groups rejoin rows for a review item and lets the TA resolve that item to an ERP', () => {
    const participants = [
      participant('Guest Student', '08:30:00 AM', '08:45:00 AM'),
      participant('Guest Student', '08:50:00 AM', '09:00:00 AM'),
    ];
    const options = { sessionDate: '2026-09-03', startTime: '08:30', endTime: '09:00' };
    const review = processZoomAttendance(participants, roster, options);
    expect(review.issues_rows).toHaveLength(1);
    expect(review.issues_rows[0]['Attended Minutes']).toBe(25);

    const resolved = processZoomAttendance(participants, roster, {
      ...options,
      participantAssignments: { [String(review.issues_rows[0].Key)]: '12345' },
    });
    expect(resolved.issues_rows).toHaveLength(0);
    expect(resolved.attendance_rows[0]['Attended Minutes']).toBe(25);
    expect(resolved.attendance_rows[0]['Match Method']).toBe('Manual');
  });

  it('retains multiple explicit participant assignments together', () => {
    const participants = [
      participant('Guest One', '08:30:00 AM', '09:30:00 AM'),
      participant('Guest Two', '08:30:00 AM', '09:30:00 AM'),
    ];
    const options = { sessionDate: '2026-09-03', startTime: '08:30', endTime: '09:30' };
    const review = processZoomAttendance(participants, roster, options);
    const keys = review.issues_rows.map((row) => String(row.Key));
    const resolved = processZoomAttendance(participants, roster, {
      ...options,
      participantAssignments: { [keys[0]]: '12345', [keys[1]]: '23456' },
    });
    expect(resolved.issues_rows).toHaveLength(0);
    expect(resolved.attendance_rows.slice(0, 2).map((row) => row.Status)).toEqual(['present', 'present']);
  });

  it('accepts the ERP_name rule without requiring exact name spelling or case', () => {
    expect(isValidZoomDisplayName('12345_something completely different', '12345')).toBe(true);
    expect(isValidZoomDisplayName('12345', '12345')).toBe(false);
    expect(isValidZoomDisplayName('12345_Ali', '12345')).toBe(true);
  });

  it('ranks exact ERP suggestions before normalized-name matches and supports search', () => {
    const suggestions = getZoomResolutionSuggestions('12345_Ali', '', [
      { erp: '23456', student_name: 'Ali Asghar', class_no: '101809' },
      { erp: '12345', student_name: 'Different Name', class_no: '101809' },
      { erp: '34567', student_name: 'Alicia Khan', class_no: '101810' },
    ], 'ali');
    expect(suggestions.map((student) => student.erp)).toEqual(['12345', '23456', '34567']);
    expect(parseZoomDisplayIdentity('12345_Ali Example')).toEqual({ erp: '12345', studentName: 'Ali Example', isValid: true });
  });

  it('shows the official timing benchmark and validates quick-add inputs', () => {
    expect(getZoomTimingSummary({ sessionDate: '2026-09-03', startTime: '08:30', endTime: '09:45', namazBreakMinutes: 15 })).toEqual({
      officialMinutes: 75,
      breakMinutes: 15,
      effectiveMinutes: 60,
      requiredMinutes: 48,
    });
    expect(validateZoomQuickAdd({ erp: '12345', studentName: 'New Student', classNo: '101809' }, [])).toEqual({ valid: true, error: '' });
    expect(validateZoomQuickAdd({ erp: '1234', studentName: 'New Student', classNo: '101809' }, [])).toMatchObject({ valid: false });
    expect(validateZoomQuickAdd({ erp: '12345', studentName: 'New Student', classNo: '101809' }, roster)).toMatchObject({ valid: false, error: expect.stringContaining('already') });
  });

  it('builds an editable save draft from report statuses and penalties', () => {
    const report: ZoomSessionReport = {
      schema_version: 1,
      generated_at: '2026-09-03T00:00:00.000Z',
      attendance_rows: [
        { ERP: '12345', Status: 'present', 'Name Penalty': -1 },
        { ERP: '23456', Status: 'absent', 'Name Penalty': -1 },
      ],
      issues_rows: [],
      absent_rows: [],
      penalties_rows: [],
      matches_rows: [],
      raw_rows: [],
    };
    const draft = buildZoomAttendanceDraft(
      report,
      roster.slice(0, 2),
      'session-1',
    );
    expect(draft.map((row) => [row.status, row.naming_penalty])).toEqual([
      ['present', true],
      ['absent', false],
    ]);
    draft[0].status = 'absent';
    draft[0].naming_penalty = false;
    expect([draft[0].status, draft[0].naming_penalty]).toEqual(['absent', false]);
  });

  it('does not treat a report from another session as the current draft', () => {
    const report = { session_id: 'session-a' } as ZoomSessionReport;
    expect(zoomReportMatchesSession(report, 'session-a')).toBe(true);
    expect(zoomReportMatchesSession(report, 'session-b')).toBe(false);
    expect(zoomReportMatchesSession({} as ZoomSessionReport, 'session-b')).toBe(true);
  });

  it('processes the supplied Zoom CSV shape without exposing its contents in logs', () => {
    const csv = [
      'Topic,ID,Duration (minutes),Start time,End time,Participants',
      'Class,1,77,"09/03/2026 08:30:26 AM","09/03/2026 09:46:50 AM",2',
      '',
      'Name (original name),Email,Join time,Leave time,Duration (minutes)',
      '12345_Ali,,"09/03/2026 08:30:29 AM","09/03/2026 09:29:53 AM",60',
    ].join('\n');
    const result = processZoomCsv(csv, roster, {
      sessionDate: '2026-09-03',
      startTime: '08:30',
      endTime: '09:46',
    });
    expect(result.rows).toBe(1);
    expect(result.attendance_rows).toHaveLength(roster.length);
  });
});
