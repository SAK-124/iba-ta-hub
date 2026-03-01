import { useCallback, useEffect, useState } from 'react';
import { toAppError, type AppError } from '@/shared/errors';
import { getAppSettings, listSubmissions, listTaAllowlist } from './api';
import type { AppSettingsRow, SubmissionRow, TaAllowlistRow } from './types';

export const useAppSettingsQuery = () => {
  const [data, setData] = useState<AppSettingsRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await getAppSettings());
    } catch (err) {
      setError(toAppError(err, 'app_settings_fetch_failed'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, isLoading, error, refetch };
};

export const useTaAllowlistQuery = (activeOnly = true) => {
  const [data, setData] = useState<TaAllowlistRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await listTaAllowlist(activeOnly));
    } catch (err) {
      setError(toAppError(err, 'ta_allowlist_fetch_failed'));
    } finally {
      setIsLoading(false);
    }
  }, [activeOnly]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, isLoading, error, refetch };
};

export const useSubmissionsQuery = (activeOnly = true) => {
  const [data, setData] = useState<SubmissionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await listSubmissions(activeOnly));
    } catch (err) {
      setError(toAppError(err, 'submissions_fetch_failed'));
    } finally {
      setIsLoading(false);
    }
  }, [activeOnly]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, isLoading, error, refetch };
};
