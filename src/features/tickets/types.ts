import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Json, TableInsert, TableRow, TableUpdate } from '@/shared/supabase-types';

export type TicketRow = TableRow<'tickets'>;
export type TicketInsert = TableInsert<'tickets'>;
export type TicketUpdate = TableUpdate<'tickets'>;

export interface TicketWithStudentName extends TicketRow {
  real_name: string;
}

export interface TicketRealtimePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: TicketRow;
  old: Partial<TicketRow>;
}

export type TicketSubscriptionHandler = (payload: TicketRealtimePayload) => void;

export type TicketChannel = RealtimeChannel;

export interface CreateTicketInput {
  entered_erp: string;
  roster_name: string | null;
  roster_class_no: string | null;
  created_by_email: string;
  status: string;
  group_type: string;
  category: string;
  subcategory?: string | null;
  details_text?: string | null;
  details_json?: Json | null;
  ta_response?: string | null;
}
