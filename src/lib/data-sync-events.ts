export const ROSTER_DATA_UPDATED_EVENT = 'roster-data-updated';
export const ATTENDANCE_DATA_UPDATED_EVENT = 'attendance-data-updated';

export interface RosterDataUpdatedDetail {
  source: string;
  emittedAt: string;
}

const FALLBACK_DETAIL: RosterDataUpdatedDetail = {
  source: 'unknown',
  emittedAt: new Date(0).toISOString(),
};

const subscribeWithDetail = (
  eventName: string,
  handler: (detail: RosterDataUpdatedDetail) => void
) => {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const listener = (event: Event) => {
    const customEvent = event as CustomEvent<RosterDataUpdatedDetail>;
    handler(customEvent.detail ?? FALLBACK_DETAIL);
  };

  window.addEventListener(eventName, listener as EventListener);

  return () => {
    window.removeEventListener(eventName, listener as EventListener);
  };
};

export const emitRosterDataUpdated = (source: string) => {
  if (typeof window === 'undefined') {
    return;
  }

  const detail: RosterDataUpdatedDetail = {
    source: source.trim() || 'unknown',
    emittedAt: new Date().toISOString(),
  };

  window.dispatchEvent(new CustomEvent<RosterDataUpdatedDetail>(ROSTER_DATA_UPDATED_EVENT, { detail }));
};

export const emitAttendanceDataUpdated = (source: string) => {
  if (typeof window === 'undefined') {
    return;
  }

  const detail: RosterDataUpdatedDetail = {
    source: source.trim() || 'unknown',
    emittedAt: new Date().toISOString(),
  };

  window.dispatchEvent(new CustomEvent<RosterDataUpdatedDetail>(ATTENDANCE_DATA_UPDATED_EVENT, { detail }));
};

export const subscribeRosterDataUpdated = (
  handler: (detail: RosterDataUpdatedDetail) => void
) => {
  return subscribeWithDetail(ROSTER_DATA_UPDATED_EVENT, handler);
};

export const subscribeAttendanceDataUpdated = (
  handler: (detail: RosterDataUpdatedDetail) => void
) => {
  return subscribeWithDetail(ATTENDANCE_DATA_UPDATED_EVENT, handler);
};
