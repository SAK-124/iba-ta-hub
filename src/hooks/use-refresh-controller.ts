import { useCallback, useEffect, useRef, useState } from 'react';
import { createRefreshController, type RefreshControllerState, type RefreshMode } from './refresh-controller';

export const useRefreshController = (
  refresh: (mode: RefreshMode) => Promise<void>,
  enabled = true,
) => {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const controllerRef = useRef<ReturnType<typeof createRefreshController> | null>(null);
  const [state, setState] = useState<RefreshControllerState>({ running: false, updating: false, mode: null });

  if (!controllerRef.current) {
    controllerRef.current = createRefreshController((mode) => refreshRef.current(mode));
  }

  useEffect(() => {
    const controller = controllerRef.current!;
    return controller.subscribe(setState);
  }, []);

  useEffect(() => () => controllerRef.current?.dispose(), []);

  const requestRefresh = useCallback(
    (mode: RefreshMode = 'background') => {
      if (!enabled) return Promise.resolve();
      return controllerRef.current!.request(mode);
    },
    [enabled],
  );

  return {
    requestRefresh,
    isRefreshing: state.running,
    isUpdating: state.updating,
    mode: state.mode,
  };
};
