import { describe, expect, it } from 'vitest';
import { normalizePublicAttendanceBoardData } from '@/lib/public-attendance-sync';

describe('normalizePublicAttendanceBoardData', () => {
  it('normalizes penalty entries and orders them by session number', () => {
    const result = normalizePublicAttendanceBoardData({
      sessions: [
        { id: 's2', session_number: 2, session_date: '2026-02-02', day_of_week: 'Saturday' },
        { id: 's1', session_number: 1, session_date: '2026-02-01', day_of_week: 'Friday' },
      ],
      students: [
        {
          class_no: '100001',
          student_name: 'Student A',
          erp: 'ERP001',
          total_penalties: 2,
          total_absences: 0,
          session_status: { s1: 'present', s2: 'present' },
          penalty_entries: [
            { session_id: 's2', session_number: 2, session_date: '2026-02-02', day_of_week: 'Saturday', details: null },
            {
              session_id: 's1',
              session_number: 1,
              session_date: '2026-02-01',
              day_of_week: 'Friday',
              details: { rejoin_count: 2, total_duration_minutes: 61 },
            },
          ],
        },
      ],
    });

    expect(result.sessions.map((session) => session.id)).toEqual(['s1', 's2']);
    expect(result.students).toHaveLength(1);
    expect(result.students[0].penalty_entries.map((entry) => entry.session_id)).toEqual(['s1', 's2']);
    expect(result.students[0].penalty_entries[0].details).toEqual({ rejoin_count: 2, total_duration_minutes: 61 });
  });

  it('defaults missing or invalid penalty entries to an empty array', () => {
    const result = normalizePublicAttendanceBoardData({
      sessions: [],
      students: [
        {
          class_no: '100002',
          student_name: 'Student B',
          erp: 'ERP002',
          total_penalties: 1,
          total_absences: 1,
          session_status: {},
          penalty_entries: 'invalid',
        },
      ],
    });

    expect(result.students).toHaveLength(1);
    expect(result.students[0].penalty_entries).toEqual([]);
  });
});
