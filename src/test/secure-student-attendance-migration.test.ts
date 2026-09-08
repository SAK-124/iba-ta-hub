import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('secure student attendance migration', () => {
  it('requires auth, binds students to their own ERP, and does not expose raw reports', () => {
    const sql = readFileSync('supabase/migrations/20260908120000_secure_student_attendance_details.sql', 'utf8');
    expect(sql).toContain("IF auth.uid() IS NULL");
    expect(sql).toContain('student_erp IS DISTINCT FROM v_auth_erp');
    expect(sql).toContain("jsonb_array_elements");
    expect(sql).toContain('EXCEPTION WHEN others');
    expect(sql).not.toContain("'raw_rows'");
    expect(sql).not.toContain("'issues_rows'");
  });
});
