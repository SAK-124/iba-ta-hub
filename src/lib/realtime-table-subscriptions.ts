import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export interface RealtimeTableSubscription {
  table: string;
  event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
  filter?: string;
  schema?: string;
}

export const subscribeToRealtimeTables = (
  channelName: string,
  subscriptions: RealtimeTableSubscription[],
  handler: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void,
): RealtimeChannel => {
  let channel = supabase.channel(channelName);

  subscriptions.forEach((subscription) => {
    channel = channel.on(
      'postgres_changes',
      {
        event: subscription.event ?? '*',
        schema: subscription.schema ?? 'public',
        table: subscription.table,
        filter: subscription.filter,
      },
      (payload) => {
        handler(payload as RealtimePostgresChangesPayload<Record<string, unknown>>);
      },
    );
  });

  return channel.subscribe();
};

export const removeRealtimeChannel = async (channel: RealtimeChannel) => {
  await supabase.removeChannel(channel);
};
