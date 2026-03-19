import { useCallback, useEffect, useState } from 'react';
import { toAppError, type AppError } from '@/shared/errors';
import { getLateDaysSummary } from './api';
import type { LateDaySummary } from './types';

export const useLateDaysSummary = (studentErp: string | null) => {
  const [data, setData] = useState<LateDaySummary>({
    remaining: 3,
    totalAllowance: 3,
    used: 0,
    granted: 0,
    groupNumber: null,
    groupUsed: 0,
    groupRemaining: 3,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

  const refetch = useCallback(async () => {
    if (!studentErp) {
      setData({ remaining: 3, totalAllowance: 3, used: 0, granted: 0, groupNumber: null, groupUsed: 0, groupRemaining: 3 });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      setData(await getLateDaysSummary(studentErp));
    } catch (err) {
      setError(toAppError(err, 'late_days_summary_fetch_failed'));
      setData({ remaining: 3, totalAllowance: 3, used: 0, granted: 0, groupNumber: null, groupUsed: 0, groupRemaining: 3 });
    } finally {
      setIsLoading(false);
    }
  }, [studentErp]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, isLoading, error, refetch };
};
