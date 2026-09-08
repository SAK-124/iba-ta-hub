import { describe, expect, it } from 'vitest';
import { orderGroupMembers } from './presentation';

describe('group presentation helpers', () => {
  it('places the student creator/POC first without changing the remaining order', () => {
    const members = orderGroupMembers({
      created_by_erp: '2',
      members: [
        { erp: '1', student_name: 'A One', class_no: 'A' },
        { erp: '2', student_name: 'B Two', class_no: 'B' },
      ],
    });

    expect(members.map((member) => member.erp)).toEqual(['2', '1']);
  });
});
