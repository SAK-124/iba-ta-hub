import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20260908150000_ta_delete_single_group.sql');

describe('single group delete migration', () => {
  it('restricts deletion to TAs and preserves attendance and roster data', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.ta_delete_group(p_group_number integer)');
    expect(sql).toContain("IF NOT public.is_ta(v_ta_email) THEN");
    expect(sql).toContain('DELETE FROM public.student_group_join_requests');
    expect(sql).toContain('DELETE FROM public.student_group_members');
    expect(sql).toContain('DELETE FROM public.student_groups');
    expect(sql).toContain('late_day_claims and attendance are intentionally preserved');
    expect(sql).not.toContain('DELETE FROM public.attendance');
    expect(sql).not.toContain('DELETE FROM public.students_roster');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.ta_delete_group(integer) TO authenticated');
  });
});
