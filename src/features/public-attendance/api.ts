import { syncPublicAttendanceSnapshot } from '@/lib/public-attendance-sync';
import type { PublicAttendanceSyncInput, PublicAttendanceSyncResult } from './types';

export const syncPublicAttendance = async (
  input: PublicAttendanceSyncInput,
): Promise<PublicAttendanceSyncResult> => {
  const result = await syncPublicAttendanceSnapshot({ source: input.source });
  return {
    ok: result.ok,
    error: result.error,
  };
};
