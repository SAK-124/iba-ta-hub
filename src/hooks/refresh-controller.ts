export type RefreshMode = 'initial' | 'background';

export type RefreshControllerState = {
  running: boolean;
  updating: boolean;
  mode: RefreshMode | null;
};

export type RefreshController = {
  request: (mode?: RefreshMode) => Promise<void>;
  subscribe: (listener: (state: RefreshControllerState) => void) => () => void;
  getState: () => RefreshControllerState;
  dispose: () => void;
};

type RefreshControllerOptions = {
  updatingDelayMs?: number;
};

/**
 * Serializes refresh requests and retains one trailing request when a refresh
 * is already running. This keeps timer, focus, realtime, and manual triggers
 * from starting a request storm while ensuring the last trigger is not lost.
 */
export const createRefreshController = (
  refresh: (mode: RefreshMode) => Promise<void>,
  { updatingDelayMs = 500 }: RefreshControllerOptions = {},
): RefreshController => {
  let state: RefreshControllerState = { running: false, updating: false, mode: null };
  let trailingMode: RefreshMode | null = null;
  let disposed = false;
  let updatingTimer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<(nextState: RefreshControllerState) => void>();

  const publish = (nextState: RefreshControllerState) => {
    state = nextState;
    listeners.forEach((listener) => listener(state));
  };

  const run = async (mode: RefreshMode): Promise<void> => {
    if (disposed) return;

    publish({ running: true, updating: false, mode });
    updatingTimer = setTimeout(() => {
      updatingTimer = null;
      if (!disposed && state.running) {
        publish({ ...state, updating: true });
      }
    }, updatingDelayMs);

    try {
      await refresh(mode);
    } finally {
      if (updatingTimer) {
        clearTimeout(updatingTimer);
        updatingTimer = null;
      }

      if (!disposed) {
        const nextMode = trailingMode;
        trailingMode = null;
        if (nextMode) {
          await run(nextMode);
        } else {
          publish({ running: false, updating: false, mode: null });
        }
      }
    }
  };

  return {
    request: async (mode = 'background') => {
      if (disposed) return;
      if (state.running) {
        // One trailing rerun is enough; preserve an initial request if one is
        // queued before the first load has completed.
        trailingMode = trailingMode === 'initial' || mode === 'initial' ? 'initial' : 'background';
        return;
      }
      await run(mode);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    getState: () => state,
    dispose: () => {
      disposed = true;
      trailingMode = null;
      if (updatingTimer) clearTimeout(updatingTimer);
      updatingTimer = null;
      listeners.clear();
    },
  };
};
