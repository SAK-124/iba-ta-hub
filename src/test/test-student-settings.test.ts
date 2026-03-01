import { describe, expect, it } from 'vitest';
import { applyTaTestStudentToBoard, applyTaTestStudentToRoster, TEST_STUDENT_ERP } from '@/lib/test-student-settings';
import type { PublicAttendanceBoardData } from '@/lib/public-attendance-sync';

describe('test-student-settings helpers', () => {
  const board: PublicAttendanceBoardData = {
    sessions: [{ id: 'session-1', session_number: 1, session_date: '2026-02-01', day_of_week: 'Friday' }],
    students: [
      {
        class_no: '100001',
        student_name: 'Regular Student',
        erp: '12345',
        total_penalties: 1,
        total_absences: 2,
        session_status: { 'session-1': 'present' },
        penalty_entries: [],
      },
      {
        class_no: 'TEST',
        student_name: 'Existing Test',
        erp: TEST_STUDENT_ERP,
        total_penalties: 0,
        total_absences: 0,
        session_status: { 'session-1': 'present' },
        penalty_entries: [],
      },
    ],
  };

  it('hides test student when disabled for TA', () => {
    const result = applyTaTestStudentToBoard(board, {
      showInTa: false,
      overrides: {},
    });

    expect(result.students.some((student) => student.erp === TEST_STUDENT_ERP)).toBe(false);
    expect(result.students).toHaveLength(1);
  });

  it('applies test student overrides when enabled for TA', () => {
    const result = applyTaTestStudentToBoard(
      { ...board, students: board.students.filter((student) => student.erp !== TEST_STUDENT_ERP) },
      {
        showInTa: true,
        overrides: {
          class_no: '00000',
          student_name: 'QA Test Student',
          total_absences: 20,
          total_penalties: 7,
          session_status: { 'session-1': 'absent' },
        },
      }
    );

    const testStudent = result.students.find((student) => student.erp === TEST_STUDENT_ERP);
    expect(testStudent).toBeDefined();
    expect(testStudent?.student_name).toBe('QA Test Student');
    expect(testStudent?.total_absences).toBe(20);
    expect(testStudent?.total_penalties).toBe(7);
    expect(testStudent?.session_status).toEqual({ 'session-1': 'absent' });
  });

  it('applies test student visibility to roster rows', () => {
    const rosterRows = [
      { id: 'row-1', class_no: '100001', student_name: 'Regular Student', erp: '12345' },
      { id: 'row-2', class_no: 'TEST', student_name: 'Existing Test', erp: TEST_STUDENT_ERP },
    ];

    const hidden = applyTaTestStudentToRoster(rosterRows, { showInTa: false, overrides: {} });
    expect(hidden.some((student) => student.erp === TEST_STUDENT_ERP)).toBe(false);

    const shown = applyTaTestStudentToRoster(
      [{ id: 'row-1', class_no: '100001', student_name: 'Regular Student', erp: '12345' }],
      {
        showInTa: true,
        overrides: { class_no: '00000', student_name: 'QA Test Student' },
      }
    );
    const testStudent = shown.find((student) => student.erp === TEST_STUDENT_ERP);
    expect(testStudent).toBeDefined();
    expect(testStudent?.student_name).toBe('QA Test Student');
    expect(testStudent?.class_no).toBe('00000');
  });
});
