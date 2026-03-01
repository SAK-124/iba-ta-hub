import { useCallback, useEffect, useState } from 'react';
import { toAppError, type AppError } from '@/shared/errors';
import { listRoster } from './api';
import type { RosterRow } from './types';

export const useRosterQuery = (limit?: number) => {
  const [data, setData] = useState<RosterRow[]>([]);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listRoster(limit);
      setData(result.rows);
      setCount(result.count);
    } catch (err) {
      setError(toAppError(err, 'roster_fetch_failed'));
    } finally {
      setIsLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, count, isLoading, error, refetch };
};
