import { useCallback, useEffect, useState } from 'react';
import { toAppError, type AppError } from '@/shared/errors';
import { listRosterReference } from './api';
import type { RosterReference } from './types';

export const useZoomRosterReference = () => {
  const [data, setData] = useState<RosterReference[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await listRosterReference());
    } catch (err) {
      setError(toAppError(err, 'zoom_roster_fetch_failed'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, isLoading, error, refetch };
};
