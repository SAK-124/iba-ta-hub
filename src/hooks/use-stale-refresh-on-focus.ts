import { useCallback, useEffect, useRef } from 'react';

interface UseStaleRefreshOnFocusOptions {
  enabled?: boolean;
  staleAfterMs?: number;
  dedupeWindowMs?: number;
}

const DEFAULT_STALE_AFTER_MS = 60_000;
const DEFAULT_DEDUPE_WINDOW_MS = 750;

export const useStaleRefreshOnFocus = (
  refresh: () => Promise<void> | void,
  options: UseStaleRefreshOnFocusOptions = {},
) => {
  const {
    enabled = true,
    staleAfterMs = DEFAULT_STALE_AFTER_MS,
    dedupeWindowMs = DEFAULT_DEDUPE_WINDOW_MS,
  } = options;
  const lastSuccessfulRefreshAtRef = useRef(0);
  const lastRefreshAttemptAtRef = useRef(0);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return;
    }

    const refreshIfStale = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      const now = Date.now();
      if (now - lastRefreshAttemptAtRef.current < dedupeWindowMs) {
        return;
      }

      if (
        lastSuccessfulRefreshAtRef.current > 0 &&
        now - lastSuccessfulRefreshAtRef.current < staleAfterMs
      ) {
        return;
      }

      lastRefreshAttemptAtRef.current = now;
      void refresh();
    };

    window.addEventListener('focus', refreshIfStale);
    document.addEventListener('visibilitychange', refreshIfStale);

    return () => {
      window.removeEventListener('focus', refreshIfStale);
      document.removeEventListener('visibilitychange', refreshIfStale);
    };
  }, [dedupeWindowMs, enabled, refresh, staleAfterMs]);

  const markRefreshed = useCallback(() => {
    lastSuccessfulRefreshAtRef.current = Date.now();
  }, []);

  return { markRefreshed };
};
