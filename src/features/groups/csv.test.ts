import { describe, expect, it } from 'vitest';
import { buildGroupsCsv } from './csv';

describe('buildGroupsCsv', () => {
  it('writes the group number only on the first row for each group', () => {
    const csv = buildGroupsCsv({
      groups: [{
        id: 'group-1', group_number: 1, display_name: null, created_by_erp: '2', created_by_email: '', created_by_role: 'student',
        student_edit_locked_at: '', created_at: '', updated_at: '', is_locked: false, member_count: 2, members: [],
      }],
      roster: [
        { erp: '2', student_name: 'B, Two', class_no: 'B', group_number: 1 },
        { erp: '1', student_name: 'A One', class_no: 'A', group_number: 1 },
        { erp: '3', student_name: 'Ungrouped', class_no: 'C', group_number: null },
      ],
    });

    expect(csv).toBe(['Group No,ERP,Full Name', '1,2,"B, Two"', ',1,A One'].join('\n'));
  });

  it('does not export ungrouped roster students', () => {
    const csv = buildGroupsCsv({
      groups: [],
      roster: [{ erp: '3', student_name: 'Ungrouped', class_no: 'C', group_number: null }],
    });

    expect(csv).toBe('Group No,ERP,Full Name');
  });
});
