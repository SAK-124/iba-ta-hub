import { useCallback, useState } from 'react';
import { syncPublicAttendance } from './api';

export const usePublicAttendanceSyncMutation = () => {
  const [isSyncing, setIsSyncing] = useState(false);

  const sync = useCallback(async (source: string) => {
    setIsSyncing(true);
    try {
      return await syncPublicAttendance({ source });
    } finally {
      setIsSyncing(false);
    }
  }, []);

  return { isSyncing, sync };
};
