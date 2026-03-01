import { supabase } from '@/integrations/supabase/client';
import { toAppError } from '@/shared/errors';
import { isObjectRecord, toNumberOr } from '@/shared/guards';
import type {
  ClaimLateDaysResult,
  LateDayAdjustmentRow,
  LateDayAssignmentRow,
  LateDayClaimRow,
  LateDaySummary,
} from './types';

export const getLateDaysSummary = async (studentEmail: string, studentErp: string): Promise<LateDaySummary> => {
  const [{ data: claims, error: claimsError }, { data: adjustments, error: adjustmentsError }] = await Promise.all([
    supabase.from('late_day_claims').select('days_used').eq('student_email', studentEmail),
    supabase.from('late_day_adjustments').select('days_delta').eq('student_erp', studentErp),
  ]);

  if (claimsError || adjustmentsError) {
    throw toAppError(claimsError || adjustmentsError, 'late_days_summary_fetch_failed');
  }

  const used = (claims ?? []).reduce((sum, claim) => sum + toNumberOr(claim.days_used), 0);
  const granted = (adjustments ?? []).reduce((sum, adjustment) => sum + toNumberOr(adjustment.days_delta), 0);
  const totalAllowance = 3 + granted;

  return {
    remaining: Math.max(totalAllowance - used, 0),
    totalAllowance,
    used,
    granted,
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

export const listLateDaysAdminData = async (): Promise<{
  assignments: LateDayAssignmentRow[];
  claims: LateDayClaimRow[];
  adjustments: LateDayAdjustmentRow[];
}> => {
  const [assignmentResponse, claimResponse, adjustmentsResponse] = await Promise.all([
    supabase
      .from('late_day_assignments')
      .select('*')
      .order('active', { ascending: false })
      .order('due_at', { ascending: true, nullsFirst: false }),
    supabase.from('late_day_claims').select('*').order('claimed_at', { ascending: false }),
    supabase.from('late_day_adjustments').select('*').order('created_at', { ascending: false }),
  ]);

  if (assignmentResponse.error) {
    throw toAppError(assignmentResponse.error, 'late_days_assignments_fetch_failed');
  }
  if (claimResponse.error) {
    throw toAppError(claimResponse.error, 'late_days_claims_fetch_failed');
  }
  if (adjustmentsResponse.error) {
    throw toAppError(adjustmentsResponse.error, 'late_days_adjustments_fetch_failed');
  }

  return {
    assignments: assignmentResponse.data ?? [],
    claims: claimResponse.data ?? [],
    adjustments: adjustmentsResponse.data ?? [],
  };
};

export const listStudentLateDaysData = async (): Promise<{
  assignments: LateDayAssignmentRow[];
  claims: LateDayClaimRow[];
  adjustments: LateDayAdjustmentRow[];
}> => {
  const [assignmentResponse, claimsResponse, adjustmentResponse] = await Promise.all([
    supabase
      .from('late_day_assignments')
      .select('*')
      .order('active', { ascending: false })
      .order('due_at', { ascending: true, nullsFirst: false }),
    supabase.from('late_day_claims').select('*').order('claimed_at', { ascending: false }),
    supabase.from('late_day_adjustments').select('*').order('created_at', { ascending: false }),
  ]);

  if (assignmentResponse.error) {
    throw toAppError(assignmentResponse.error, 'late_days_assignments_fetch_failed');
  }
  if (claimsResponse.error) {
    throw toAppError(claimsResponse.error, 'late_days_claims_fetch_failed');
  }
  if (adjustmentResponse.error) {
    throw toAppError(adjustmentResponse.error, 'late_days_adjustments_fetch_failed');
  }

  return {
    assignments: assignmentResponse.data ?? [],
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
