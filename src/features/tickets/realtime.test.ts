import { describe, expect, it } from 'vitest';
import { applyTicketRealtimeRow } from './realtime';
import type { TicketRealtimePayload, TicketRow } from './types';

const makeTicket = (id: string, createdAt: string, overrides: Partial<TicketRow> = {}): TicketRow => ({
  id,
  created_at: createdAt,
  entered_erp: '12345',
  roster_name: 'Student',
  roster_class_no: 'A',
  created_by_email: 'student@khi.iba.edu.pk',
  status: 'pending',
  group_type: 'class_issue',
  category: 'Missing attendance',
  subcategory: null,
  details_text: 'details',
  details_json: null,
  ta_response: null,
  ...overrides,
});

describe('applyTicketRealtimeRow', () => {
  it('inserts new rows and keeps newest first', () => {
    const existing = [makeTicket('1', '2025-01-01T00:00:00.000Z')];
    const payload: TicketRealtimePayload = {
      eventType: 'INSERT',
      new: makeTicket('2', '2025-01-02T00:00:00.000Z'),
      old: {},
    };

    const updated = applyTicketRealtimeRow(existing, payload);
    expect(updated.map((ticket) => ticket.id)).toEqual(['2', '1']);
  });

  it('updates existing rows in place', () => {
    const existing = [makeTicket('1', '2025-01-01T00:00:00.000Z')];
    const payload: TicketRealtimePayload = {
      eventType: 'UPDATE',
      new: makeTicket('1', '2025-01-01T00:00:00.000Z', { status: 'resolved' }),
      old: { id: '1' },
    };

    const updated = applyTicketRealtimeRow(existing, payload);
    expect(updated).toHaveLength(1);
    expect(updated[0].status).toBe('resolved');
  });

  it('removes rows on delete event', () => {
    const existing = [
      makeTicket('1', '2025-01-01T00:00:00.000Z'),
      makeTicket('2', '2025-01-02T00:00:00.000Z'),
    ];
    const payload: TicketRealtimePayload = {
      eventType: 'DELETE',
      new: {} as TicketRow,
      old: { id: '1' },
    };

    const updated = applyTicketRealtimeRow(existing, payload);
    expect(updated.map((ticket) => ticket.id)).toEqual(['2']);
  });
});
