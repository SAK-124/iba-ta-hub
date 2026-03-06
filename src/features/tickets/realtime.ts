import type { TicketRealtimePayload, TicketRow } from './types';

interface HasId {
  id: string;
}

interface HasCreatedAt {
  created_at: string;
}

export const sortByCreatedAtDesc = <T extends HasCreatedAt>(rows: T[]): T[] =>
  [...rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

export const upsertRowById = <T extends HasId & HasCreatedAt>(rows: T[], nextRow: T): T[] => {
  const existingIndex = rows.findIndex((row) => row.id === nextRow.id);
  if (existingIndex === -1) {
    return sortByCreatedAtDesc([nextRow, ...rows]);
  }

  const nextRows = [...rows];
  nextRows[existingIndex] = nextRow;
  return nextRows;
};

export const removeRowById = <T extends HasId>(rows: T[], id: string): T[] =>
  rows.filter((row) => row.id !== id);

export const applyTicketRealtimeRow = (rows: TicketRow[], payload: TicketRealtimePayload): TicketRow[] => {
  if (payload.eventType === 'DELETE') {
    const deletedId = payload.old.id;
    if (!deletedId) return rows;
    return removeRowById(rows, deletedId);
  }

  const nextTicket = payload.new;
  if (!nextTicket?.id) {
    return rows;
  }

  return upsertRowById(rows, nextTicket);
};
