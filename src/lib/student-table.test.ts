import { describe, expect, it } from 'vitest';
import { sortStudentRows } from './student-table';

describe('student table helpers', () => {
  it('sorts rows by class, name, then ERP deterministically', () => {
    const rows = [
      { class_no: '10', student_name: 'Zara', erp: '20' },
      { class_no: '2', student_name: 'Same', erp: '9' },
      { class_no: '2', student_name: 'Same', erp: '10' },
      { class_no: '2', student_name: 'Adeel', erp: '30' },
    ];

    expect(sortStudentRows(rows).map((row) => row.erp)).toEqual(['30', '9', '10', '20']);
  });
});
