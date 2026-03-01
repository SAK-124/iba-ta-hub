import { supabase } from '@/integrations/supabase/client';
import { toAppError } from '@/shared/errors';
import type {
  CreateTicketInput,
  TicketChannel,
  TicketRealtimePayload,
  TicketRow,
  TicketSubscriptionHandler,
  TicketWithStudentName,
} from './types';

const augmentWithRosterNames = async (tickets: TicketRow[]): Promise<TicketWithStudentName[]> => {
  const erps = [...new Set(tickets.map((ticket) => ticket.entered_erp))].filter(Boolean);

  if (erps.length === 0) {
    return tickets.map((ticket) => ({
      ...ticket,
      real_name: ticket.roster_name || 'Unknown',
    }));
  }

  const { data: rosterData, error } = await supabase
    .from('students_roster')
    .select('erp, student_name')
    .in('erp', erps);

  if (error) {
    throw toAppError(error, 'roster_names_fetch_failed');
  }

  const nameMap = new Map<string, string>();
  (rosterData ?? []).forEach((entry) => {
    nameMap.set(entry.erp, entry.student_name);
  });

  return tickets.map((ticket) => ({
    ...ticket,
    real_name: nameMap.get(ticket.entered_erp) || ticket.roster_name || 'Unknown',
  }));
};

export const listTickets = async (): Promise<TicketWithStudentName[]> => {
  const { data, error } = await supabase.from('tickets').select('*').order('created_at', { ascending: false });
  if (error) {
    throw toAppError(error, 'tickets_fetch_failed');
  }

  return augmentWithRosterNames((data ?? []) as TicketRow[]);
};

export const listTicketsByErp = async (erp: string): Promise<TicketRow[]> => {
  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .eq('entered_erp', erp)
    .order('created_at', { ascending: false });

  if (error) {
    throw toAppError(error, 'tickets_fetch_failed');
  }

  return (data ?? []) as TicketRow[];
};

export const createTicket = async (input: CreateTicketInput): Promise<void> => {
  const { error } = await supabase.from('tickets').insert(input);
  if (error) {
    throw toAppError(error, 'ticket_create_failed');
  }
};

export const toggleTicketStatus = async (ticket: TicketRow): Promise<void> => {
  const nextStatus = ticket.status === 'pending' ? 'resolved' : 'pending';
  const { error } = await supabase.from('tickets').update({ status: nextStatus }).eq('id', ticket.id);
  if (error) {
    throw toAppError(error, 'ticket_status_update_failed');
  }
};

export const deleteTicket = async (ticketId: string): Promise<void> => {
  const { error } = await supabase.from('tickets').delete().eq('id', ticketId);
  if (error) {
    throw toAppError(error, 'ticket_delete_failed');
  }
};

export const updateTicketResponse = async (ticketId: string, taResponse: string): Promise<void> => {
  const { error } = await supabase.from('tickets').update({ ta_response: taResponse }).eq('id', ticketId);
  if (error) {
    throw toAppError(error, 'ticket_response_update_failed');
  }
};

export const subscribeMyTickets = (erp: string, handler: TicketSubscriptionHandler): TicketChannel => {
  return supabase
    .channel('my-tickets')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'tickets',
        filter: `entered_erp=eq.${erp}`,
      },
      (payload) => handler(payload as unknown as TicketRealtimePayload),
    )
    .subscribe();
};

export const subscribeAllTickets = (handler: TicketSubscriptionHandler): TicketChannel => {
  return supabase
    .channel('ta-tickets')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, (payload) => {
      handler(payload as unknown as TicketRealtimePayload);
    })
    .subscribe();
};

export const removeTicketChannel = async (channel: TicketChannel): Promise<void> => {
  await supabase.removeChannel(channel);
};

export const addRuleExceptionFromTicket = async (input: {
  erp: string;
  student_name: string;
  class_no: string | null;
  issue_type: string;
  assigned_day: string;
  notes: string;
}): Promise<void> => {
  const { error } = await supabase.from('rule_exceptions').insert(input);
  if (error) {
    throw toAppError(error, 'rule_exception_create_failed');
  }
};
