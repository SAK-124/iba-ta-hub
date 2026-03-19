import { useCallback, useEffect, useState } from 'react';
import { toAppError, type AppError } from '@/shared/errors';
import { getStudentGroupsState, listGroupAdminState } from './api';
import type { GroupAdminState, StudentGroupState } from './types';

const EMPTY_STUDENT_STATE: StudentGroupState = {
  student_email: '',
  student_erp: '',
  current_group_id: null,
  groups: [],
  roster: [],
};

const EMPTY_ADMIN_STATE: GroupAdminState = {
  viewer_email: '',
  groups: [],
  roster: [],
};

export const useStudentGroupsState = (enabled: boolean) => {
  const [data, setData] = useState<StudentGroupState>(EMPTY_STUDENT_STATE);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<AppError | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled) {
      setData(EMPTY_STUDENT_STATE);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      setData(await getStudentGroupsState());
    } catch (err) {
      setError(toAppError(err, 'student_groups_state_fetch_failed'));
      setData(EMPTY_STUDENT_STATE);
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, setData, isLoading, error, refetch };
};

export const useGroupAdminState = (enabled = true) => {
  const [data, setData] = useState<GroupAdminState>(EMPTY_ADMIN_STATE);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<AppError | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled) {
      setData(EMPTY_ADMIN_STATE);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      setData(await listGroupAdminState());
    } catch (err) {
      setError(toAppError(err, 'group_admin_state_fetch_failed'));
      setData(EMPTY_ADMIN_STATE);
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, setData, isLoading, error, refetch };
};
