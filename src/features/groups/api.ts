import { supabase } from '@/integrations/supabase/client';
import { toAppError } from '@/shared/errors';
import { isObjectRecord, isString, toNumberOr } from '@/shared/guards';
import type { Json } from '@/shared/supabase-types';
import type {
  GroupAdminState,
  GroupAdjustAllResult,
  GroupClearRosterResult,
  GroupCreateInput,
  GroupDeadlineUpdateResult,
  GroupMember,
  GroupMutationResult,
  GroupRecomputeResult,
  GroupRosterEntry,
  GroupSummary,
  StudentGroupState,
} from './types';

const parseGroupMember = (value: unknown): GroupMember | null => {
  if (!isObjectRecord(value) || !isString(value.erp) || !isString(value.student_name) || !isString(value.class_no)) {
    return null;
  }

  return {
    erp: value.erp,
    student_name: value.student_name,
    class_no: value.class_no,
  };
};

const parseGroupSummary = (value: unknown): GroupSummary | null => {
  if (!isObjectRecord(value) || !isString(value.id)) {
    return null;
  }

  const members = Array.isArray(value.members)
    ? value.members.map(parseGroupMember).filter((member): member is GroupMember => member !== null)
    : [];

  const createdByRole = value.created_by_role === 'ta' ? 'ta' : 'student';

  return {
    id: value.id,
    group_number: toNumberOr(value.group_number, 0),
    display_name: isString(value.display_name) ? value.display_name : null,
    created_by_erp: isString(value.created_by_erp) ? value.created_by_erp : null,
    created_by_email: isString(value.created_by_email) ? value.created_by_email : '',
    created_by_role: createdByRole,
    student_edit_locked_at: isString(value.student_edit_locked_at) ? value.student_edit_locked_at : '',
    created_at: isString(value.created_at) ? value.created_at : '',
    updated_at: isString(value.updated_at) ? value.updated_at : '',
    is_locked: Boolean(value.is_locked),
    member_count: toNumberOr(value.member_count, members.length),
    members,
  };
};

const parseRosterEntry = (value: unknown): GroupRosterEntry | null => {
  if (!isObjectRecord(value) || !isString(value.erp) || !isString(value.student_name) || !isString(value.class_no)) {
    return null;
  }

  return {
    erp: value.erp,
    student_name: value.student_name,
    class_no: value.class_no,
    group_number: typeof value.group_number === 'number' ? value.group_number : null,
  };
};

const parseStudentGroupState = (value: unknown): StudentGroupState => {
  if (!isObjectRecord(value) || !isString(value.student_email) || !isString(value.student_erp)) {
    throw new Error('Invalid student group state payload');
  }

  return {
    student_email: value.student_email,
    student_erp: value.student_erp,
    current_group_id: isString(value.current_group_id) ? value.current_group_id : null,
    groups: Array.isArray(value.groups)
      ? value.groups.map(parseGroupSummary).filter((group): group is GroupSummary => group !== null)
      : [],
    roster: Array.isArray(value.roster)
      ? value.roster.map(parseRosterEntry).filter((entry): entry is GroupRosterEntry => entry !== null)
      : [],
  };
};

const parseGroupAdminState = (value: unknown): GroupAdminState => {
  if (!isObjectRecord(value) || !isString(value.viewer_email)) {
    throw new Error('Invalid group admin state payload');
  }

  return {
    viewer_email: value.viewer_email,
    groups: Array.isArray(value.groups)
      ? value.groups.map(parseGroupSummary).filter((group): group is GroupSummary => group !== null)
      : [],
    roster: Array.isArray(value.roster)
      ? value.roster.map(parseRosterEntry).filter((entry): entry is GroupRosterEntry => entry !== null)
      : [],
  };
};

const parseGroupRecomputeResult = (value: unknown): GroupRecomputeResult => {
  if (!isObjectRecord(value)) {
    throw new Error('Invalid group recompute payload');
  }

  return {
    success: value.success !== false,
    group_number: toNumberOr(value.group_number, 0),
    member_count: toNumberOr(value.member_count, 0),
    recomputed_batches: toNumberOr(value.recomputed_batches, 0),
  };
};

const parseGroupAdjustAllResult = (value: unknown): GroupAdjustAllResult => {
  if (!isObjectRecord(value)) {
    throw new Error('Invalid group adjust payload');
  }

  return {
    success: value.success !== false,
    group_number: toNumberOr(value.group_number, 0),
    member_count: toNumberOr(value.member_count, 0),
    group_used_days: toNumberOr(value.group_used_days, 0),
    group_remaining_days: toNumberOr(value.group_remaining_days, 0),
    adjusted_members: toNumberOr(value.adjusted_members, 0),
  };
};

const parseGroupClearRosterResult = (value: unknown): GroupClearRosterResult => {
  if (!isObjectRecord(value)) {
    throw new Error('Invalid clear roster payload');
  }

  return {
    success: value.success !== false,
    removed_members: toNumberOr(value.removed_members, 0),
    removed_groups: toNumberOr(value.removed_groups, 0),
    removed_batches: toNumberOr(value.removed_batches, 0),
    removed_sync_adjustments: toNumberOr(value.removed_sync_adjustments, 0),
  };
};

const parseGroupDeadlineUpdateResult = (value: unknown): GroupDeadlineUpdateResult => {
  if (!isObjectRecord(value)) {
    throw new Error('Invalid group deadline payload');
  }

  return {
    success: value.success !== false,
    updated_groups: toNumberOr(value.updated_groups, 0),
    deadline: isString(value.deadline) ? value.deadline : '',
  };
};

export const getStudentGroupsState = async (): Promise<StudentGroupState> => {
  const { data, error } = await supabase.rpc('get_student_groups_state');
  if (error) {
    throw toAppError(error, 'student_groups_state_fetch_failed');
  }

  return parseStudentGroupState(data);
};

export const listGroupAdminState = async (): Promise<GroupAdminState> => {
  const { data, error } = await supabase.rpc('list_group_admin_state');
  if (error) {
    throw toAppError(error, 'group_admin_state_fetch_failed');
  }

  return parseGroupAdminState(data);
};

const makeStudentMutationResult = (value: unknown): GroupMutationResult<StudentGroupState> => ({
  success: true,
  state: parseStudentGroupState(value),
  data: isObjectRecord(value) ? (value as Json) : undefined,
});

const makeAdminMutationResult = (value: unknown): GroupMutationResult<GroupAdminState> => ({
  success: true,
  state: parseGroupAdminState(value),
  data: isObjectRecord(value) ? (value as Json) : undefined,
});

export const studentCreateGroup = async (groupNumber: number): Promise<GroupMutationResult<StudentGroupState>> => {
  const { data, error } = await supabase.rpc('student_create_group', { p_group_number: groupNumber });
  if (error) {
    throw toAppError(error, 'student_group_create_failed');
  }

  return makeStudentMutationResult(data);
};

export const studentJoinGroup = async (groupNumber: number): Promise<GroupMutationResult<StudentGroupState>> => {
  const { data, error } = await supabase.rpc('student_join_group', { p_group_number: groupNumber });
  if (error) {
    throw toAppError(error, 'student_group_join_failed');
  }

  return makeStudentMutationResult(data);
};

export const studentAddGroupMember = async (
  groupNumber: number,
  studentErp: string,
): Promise<GroupMutationResult<StudentGroupState>> => {
  const { data, error } = await supabase.rpc('student_add_group_member', {
    p_group_number: groupNumber,
    p_student_erp: studentErp,
  });
  if (error) {
    throw toAppError(error, 'student_group_member_add_failed');
  }

  return makeStudentMutationResult(data);
};

export const studentRemoveGroupMember = async (
  groupNumber: number,
  studentErp: string,
): Promise<GroupMutationResult<StudentGroupState>> => {
  const { data, error } = await supabase.rpc('student_remove_group_member', {
    p_group_number: groupNumber,
    p_student_erp: studentErp,
  });
  if (error) {
    throw toAppError(error, 'student_group_member_remove_failed');
  }

  return makeStudentMutationResult(data);
};

export const studentLeaveGroup = async (): Promise<GroupMutationResult<StudentGroupState>> => {
  const { data, error } = await supabase.rpc('student_leave_group');
  if (error) {
    throw toAppError(error, 'student_group_leave_failed');
  }

  return makeStudentMutationResult(data);
};

export const taSetStudentGroup = async (
  studentErp: string,
  groupNumber: number | null,
): Promise<GroupMutationResult<GroupAdminState>> => {
  const { data, error } = await supabase.rpc('ta_set_student_group', {
    p_student_erp: studentErp,
    p_group_number: groupNumber ?? null,
  });
  if (error) {
    throw toAppError(error, 'ta_set_student_group_failed');
  }

  return makeAdminMutationResult(data);
};

export const taRecomputeGroupLateDays = async (groupNumber: number): Promise<GroupRecomputeResult> => {
  const { data, error } = await supabase.rpc('ta_recompute_group_late_days', {
    p_group_number: groupNumber,
  });
  if (error) {
    throw toAppError(error, 'ta_recompute_group_late_days_failed');
  }

  return parseGroupRecomputeResult(data);
};

export const taAdjustAllGroupLateDays = async (groupNumber: number): Promise<GroupAdjustAllResult> => {
  const { data, error } = await supabase.rpc('ta_adjust_all_group_late_days', {
    p_group_number: groupNumber,
  });
  if (error) {
    throw toAppError(error, 'ta_adjust_all_group_late_days_failed');
  }

  return parseGroupAdjustAllResult(data);
};

export const taClearGroupRoster = async (): Promise<GroupClearRosterResult> => {
  const { data, error } = await supabase.rpc('ta_clear_group_roster');
  if (error) {
    throw toAppError(error, 'ta_clear_group_roster_failed');
  }

  return parseGroupClearRosterResult(data);
};

export const taCreateGroup = async (input: GroupCreateInput): Promise<GroupMutationResult<GroupAdminState>> => {
  const { data, error } = await supabase.rpc('ta_create_group', {
    p_group_number: input.groupNumber,
    p_display_name: input.displayName?.trim() || null,
    p_student_erps: input.studentErps,
    p_edit_deadline: input.editDeadline,
  });
  if (error) {
    throw toAppError(error, 'ta_create_group_failed');
  }

  return makeAdminMutationResult(data);
};

export const taEnableGroupEditingAll = async (): Promise<GroupMutationResult<GroupAdminState>> => {
  const { data, error } = await supabase.rpc('ta_enable_group_editing_all');
  if (error) {
    throw toAppError(error, 'ta_enable_group_editing_all_failed');
  }

  return makeAdminMutationResult(data);
};

export const taEnableGroupEditingSelected = async (
  groupNumbers: number[],
): Promise<GroupMutationResult<GroupAdminState>> => {
  const { data, error } = await supabase.rpc('ta_enable_group_editing_selected', {
    p_group_numbers: groupNumbers,
  });
  if (error) {
    throw toAppError(error, 'ta_enable_group_editing_selected_failed');
  }

  return makeAdminMutationResult(data);
};

export const taSetGroupEditDeadlineAll = async (deadline: string): Promise<GroupDeadlineUpdateResult> => {
  const { data, error } = await supabase.rpc('ta_set_group_edit_deadline_all', {
    p_deadline: deadline,
  });
  if (error) {
    throw toAppError(error, 'ta_set_group_edit_deadline_all_failed');
  }

  return parseGroupDeadlineUpdateResult(data);
};

export const taSetGroupEditDeadlineSelected = async (
  groupNumbers: number[],
  deadline: string,
): Promise<GroupDeadlineUpdateResult> => {
  const { data, error } = await supabase.rpc('ta_set_group_edit_deadline_selected', {
    p_group_numbers: groupNumbers,
    p_deadline: deadline,
  });
  if (error) {
    throw toAppError(error, 'ta_set_group_edit_deadline_selected_failed');
  }

  return parseGroupDeadlineUpdateResult(data);
};
