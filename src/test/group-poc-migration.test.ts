import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20260908133000_group_poc_selection.sql');

describe('group POC migration', () => {
  it('validates, persists, and safely reassigns a member POC', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('ta_create_group_with_poc');
    expect(sql).toContain('Select exactly one POC from the group members');
    expect(sql).toContain('ta_set_group_poc');
    expect(sql).toContain('POC must be a current member');
    expect(sql).toContain('g.created_by_erp = v_erp');
    expect(sql).toContain('Only the group POC or a TA can respond to requests');
    expect(sql).toContain('ORDER BY roster.class_no, roster.student_name, roster.erp');
    expect(sql).toContain('created_by_erp = v_replacement_erp');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.student_leave_group()');
    expect(sql).toContain('PERFORM public.reassign_group_creator_if_needed(v_group.id, v_actor_erp, v_actor_email)');
  });
});
