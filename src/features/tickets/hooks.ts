import { useCallback, useEffect, useState } from 'react';
import { toAppError, type AppError } from '@/shared/errors';
import { listTickets, listTicketsByErp } from './api';
import type { TicketRow, TicketWithStudentName } from './types';

export const useIssueQueue = () => {
  const [data, setData] = useState<TicketWithStudentName[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await listTickets());
    } catch (err) {
      setError(toAppError(err, 'tickets_fetch_failed'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, isLoading, error, refetch };
};

export const useMyTicketsQuery = (erp: string | null) => {
  const [data, setData] = useState<TicketRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const refetch = useCallback(async () => {
    if (!erp) {
      setData([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      setData(await listTicketsByErp(erp));
    } catch (err) {
      setError(toAppError(err, 'tickets_fetch_failed'));
    } finally {
      setIsLoading(false);
    }
  }, [erp]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, isLoading, error, refetch };
};
