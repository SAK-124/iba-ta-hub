import { supabase } from '@/integrations/supabase/client';
import { toAppError } from '@/shared/errors';
import { isObjectRecord, toNumberOr } from '@/shared/guards';
import type {
  ClaimLateDaysResult,
  LateDayAdjustmentRow,
  LateDayAssignmentRow,
  LateDayClaimBatchRow,
  LateDayClaimRow,
  LateDaySummary,
} from './types';

export const getLateDaysSummary = async (studentErp: string): Promise<LateDaySummary> => {
  const { data, error } = await supabase.rpc('get_late_day_summary', {
    p_student_erp: studentErp,
  });

  if (error) {
    throw toAppError(error, 'late_days_summary_fetch_failed');
  }

  if (!isObjectRecord(data)) {
    return {
      remaining: 3,
      totalAllowance: 3,
      used: 0,
      granted: 0,
      groupNumber: null,
      groupUsed: 0,
      groupRemaining: 3,
    };
  }

  return {
    remaining: toNumberOr(data.remaining, 3),
    totalAllowance: toNumberOr(data.totalAllowance, 3),
    used: toNumberOr(data.used, 0),
    granted: toNumberOr(data.granted, 0),
    groupNumber: typeof data.group_number === 'number' ? data.group_number : null,
    groupUsed: toNumberOr(data.group_used, 0),
    groupRemaining: toNumberOr(data.group_remaining, 3),
  };
};

export const claimLateDays = async (assignmentId: string, days: number): Promise<ClaimLateDaysResult> => {
  const { data, error } = await supabase.rpc('claim_late_days', {
    p_assignment_id: assignmentId,
    p_days: days,
  });

  if (error) {
    throw toAppError(error, 'late_days_claim_failed');
  }

  if (!isObjectRecord(data)) {
    return { success: true };
  }

  return {
    success: data.success !== false,
    message: typeof data.message === 'string' ? data.message : undefined,
    data,
  };
};

export const taAddLateDay = async (studentErp: string, days: number, reason?: string): Promise<ClaimLateDaysResult> => {
  const { data, error } = await supabase.rpc('ta_add_late_day', {
    p_student_erp: studentErp,
    p_days: days,
    p_reason: reason,
  });

  if (error) {
    throw toAppError(error, 'late_days_ta_add_failed');
  }

  if (!isObjectRecord(data)) {
    return { success: true };
  }

  return {
    success: data.success !== false,
    message: typeof data.message === 'string' ? data.message : undefined,
    data,
  };
};

export const taClaimLateDays = async (studentErp: string, assignmentId: string, days: number): Promise<ClaimLateDaysResult> => {
  const { data, error } = await supabase.rpc('ta_claim_late_days', {
    p_student_erp: studentErp,
    p_assignment_id: assignmentId,
    p_days: days,
  });

  if (error) {
    throw toAppError(error, 'late_days_ta_claim_failed');
  }

  if (!isObjectRecord(data)) {
    return { success: true };
  }

  return {
    success: data.success !== false,
    message: typeof data.message === 'string' ? data.message : undefined,
    data,
  };
};

export const listLateDaysAdminData = async (): Promise<{
  assignments: LateDayAssignmentRow[];
  batches: LateDayClaimBatchRow[];
  claims: LateDayClaimRow[];
  adjustments: LateDayAdjustmentRow[];
}> => {
  const [assignmentResponse, batchResponse, claimResponse, adjustmentsResponse] = await Promise.all([
    supabase
      .from('late_day_assignments')
      .select('*')
      .order('active', { ascending: false })
      .order('due_at', { ascending: true, nullsFirst: false }),
    supabase.from('late_day_claim_batches').select('*').order('claimed_at', { ascending: false }),
    supabase.from('late_day_claims').select('*').order('claimed_at', { ascending: false }),
    supabase.from('late_day_adjustments').select('*').order('created_at', { ascending: false }),
  ]);

  if (assignmentResponse.error) {
    throw toAppError(assignmentResponse.error, 'late_days_assignments_fetch_failed');
  }
  if (batchResponse.error) {
    throw toAppError(batchResponse.error, 'late_days_claim_batches_fetch_failed');
  }
  if (claimResponse.error) {
    throw toAppError(claimResponse.error, 'late_days_claims_fetch_failed');
  }
  if (adjustmentsResponse.error) {
    throw toAppError(adjustmentsResponse.error, 'late_days_adjustments_fetch_failed');
  }

  return {
    assignments: assignmentResponse.data ?? [],
    batches: batchResponse.data ?? [],
    claims: claimResponse.data ?? [],
    adjustments: adjustmentsResponse.data ?? [],
  };
};

export const listStudentLateDaysData = async (): Promise<{
  assignments: LateDayAssignmentRow[];
  batches: LateDayClaimBatchRow[];
  claims: LateDayClaimRow[];
  adjustments: LateDayAdjustmentRow[];
}> => {
  const [assignmentResponse, batchResponse, claimsResponse, adjustmentResponse] = await Promise.all([
    supabase
      .from('late_day_assignments')
      .select('*')
      .order('active', { ascending: false })
      .order('due_at', { ascending: true, nullsFirst: false }),
    supabase.from('late_day_claim_batches').select('*').order('claimed_at', { ascending: false }),
    supabase.from('late_day_claims').select('*').order('claimed_at', { ascending: false }),
    supabase.from('late_day_adjustments').select('*').order('created_at', { ascending: false }),
  ]);

  if (assignmentResponse.error) {
    throw toAppError(assignmentResponse.error, 'late_days_assignments_fetch_failed');
  }
  if (batchResponse.error) {
    throw toAppError(batchResponse.error, 'late_days_claim_batches_fetch_failed');
  }
  if (claimsResponse.error) {
    throw toAppError(claimsResponse.error, 'late_days_claims_fetch_failed');
  }
  if (adjustmentResponse.error) {
    throw toAppError(adjustmentResponse.error, 'late_days_adjustments_fetch_failed');
  }

  return {
    assignments: assignmentResponse.data ?? [],
    batches: batchResponse.data ?? [],
    claims: claimsResponse.data ?? [],
    adjustments: adjustmentResponse.data ?? [],
  };
};

export const createLateDayAssignment = async (title: string, dueAt: string | null): Promise<void> => {
  const { error } = await supabase.from('late_day_assignments').insert({
    title,
    due_at: dueAt,
    active: true,
  });

  if (error) {
    throw toAppError(error, 'late_days_assignment_create_failed');
  }
};

export const updateLateDayAssignment = async (
  id: string,
  input: { title: string; due_at: string | null },
): Promise<void> => {
  const { error } = await supabase.from('late_day_assignments').update(input).eq('id', id);
  if (error) {
    throw toAppError(error, 'late_days_assignment_update_failed');
  }
};

export const archiveLateDayAssignment = async (id: string): Promise<void> => {
  const { error } = await supabase.from('late_day_assignments').update({ active: false }).eq('id', id);
  if (error) {
    throw toAppError(error, 'late_days_assignment_archive_failed');
  }
};

export const deleteLateDayClaim = async (id: string): Promise<void> => {
  const { error } = await supabase.from('late_day_claims').delete().eq('id', id);
  if (error) {
    throw toAppError(error, 'late_days_claim_delete_failed');
  }
};
