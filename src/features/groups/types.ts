import type { Json } from '@/shared/supabase-types';

export interface GroupMember {
  erp: string;
  student_name: string;
  class_no: string;
}

export interface GroupSummary {
  id: string;
  group_number: number;
  display_name: string | null;
  created_by_erp: string | null;
  created_by_email: string;
  created_by_role: 'student' | 'ta';
  student_edit_locked_at: string;
  created_at: string;
  updated_at: string;
  is_locked: boolean;
  member_count: number;
  members: GroupMember[];
}

export interface GroupRosterEntry {
  erp: string;
  student_name: string;
  class_no: string;
  group_number: number | null;
}

export interface StudentGroupState {
  student_email: string;
  student_erp: string;
  current_group_id: string | null;
  groups: GroupSummary[];
  roster: GroupRosterEntry[];
}

export interface GroupAdminState {
  viewer_email: string;
  groups: GroupSummary[];
  roster: GroupRosterEntry[];
}

export interface GroupRecomputeResult {
  success: boolean;
  group_number: number;
  member_count: number;
  recomputed_batches: number;
}

export interface GroupAdjustAllResult {
  success: boolean;
  group_number: number;
  member_count: number;
  group_used_days: number;
  group_remaining_days: number;
  adjusted_members: number;
}

export interface GroupClearRosterResult {
  success: boolean;
  removed_members: number;
  removed_groups: number;
  removed_batches: number;
  removed_sync_adjustments: number;
}

export interface GroupDeadlineUpdateResult {
  success: boolean;
  updated_groups: number;
  deadline: string;
}

export interface GroupCreateInput {
  groupNumber: number;
  displayName?: string | null;
  studentErps: string[];
  editDeadline: string;
}

export interface GroupMutationResult<TState> {
  success: boolean;
  state: TState;
  data?: Json;
}
