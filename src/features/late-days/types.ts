import type { Json, TableRow } from '@/shared/supabase-types';

export type LateDayClaimRow = TableRow<'late_day_claims'>;
export type LateDayAdjustmentRow = TableRow<'late_day_adjustments'>;
export type LateDayAssignmentRow = TableRow<'late_day_assignments'>;

export interface LateDaySummary {
  remaining: number;
  totalAllowance: number;
  used: number;
  granted: number;
}

export interface ClaimLateDaysResult {
  success: boolean;
  message?: string;
  data?: Json;
}
