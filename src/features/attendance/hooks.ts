import { useCallback, useEffect, useState } from 'react';
import { toAppError, type AppError } from '@/shared/errors';
import {
  getStudentAttendanceSummary,
  insertAttendance,
  listAttendanceBySession,
  listRoster,
  listSessions,
  updateAttendancePenalty,
  updateAttendanceStatus,
} from './api';
import type {
  AttendanceInsert,
  AttendanceRowWithRoster,
  AttendanceStatus,
  RosterRow,
  SessionRow,
  StudentAttendanceSummary,
} from './types';

interface QueryState<T> {
  data: T;
  isLoading: boolean;
  error: AppError | null;
  refetch: () => Promise<void>;
}

export const useSessionsQuery = (): QueryState<SessionRow[]> => {
  const [data, setData] = useState<SessionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await listSessions());
    } catch (err) {
      setError(toAppError(err, 'sessions_fetch_failed'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, isLoading, error, refetch };
};

export const useSessionAttendanceQuery = (sessionId: string | null): QueryState<AttendanceRowWithRoster[]> => {
  const [data, setData] = useState<AttendanceRowWithRoster[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const refetch = useCallback(async () => {
    if (!sessionId) {
      setData([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      setData(await listAttendanceBySession(sessionId));
    } catch (err) {
      setError(toAppError(err, 'attendance_session_fetch_failed'));
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, isLoading, error, refetch };
};

export const useRosterQuery = (): QueryState<RosterRow[]> => {
  const [data, setData] = useState<RosterRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await listRoster());
    } catch (err) {
      setError(toAppError(err, 'roster_fetch_failed'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, isLoading, error, refetch };
};

export const useStudentAttendanceQuery = (studentErp: string | null): QueryState<StudentAttendanceSummary> => {
  const [data, setData] = useState<StudentAttendanceSummary>({
    records: [],
    total_absences: 0,
    total_naming_penalties: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const refetch = useCallback(async () => {
    if (!studentErp) {
      setData({ records: [], total_absences: 0, total_naming_penalties: 0 });
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      setData(await getStudentAttendanceSummary(studentErp));
    } catch (err) {
      setError(toAppError(err, 'attendance_fetch_failed'));
    } finally {
      setIsLoading(false);
    }
  }, [studentErp]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, isLoading, error, refetch };
};

export const useAttendanceMutations = () => {
  const saveRows = useCallback(async (rows: AttendanceInsert[]) => {
    await insertAttendance(rows);
  }, []);

  const setStatus = useCallback(async (attendanceId: string, status: AttendanceStatus) => {
    await updateAttendanceStatus(attendanceId, status);
  }, []);

  const setPenalty = useCallback(async (attendanceId: string, namingPenalty: boolean) => {
    await updateAttendancePenalty(attendanceId, namingPenalty);
  }, []);

  return {
    saveRows,
    setStatus,
    setPenalty,
  };
};
