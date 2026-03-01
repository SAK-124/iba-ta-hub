import type { Database, Json, Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type { Database, Json };

export type TableRow<T extends keyof Database['public']['Tables']> = Tables<T>;
export type TableInsert<T extends keyof Database['public']['Tables']> = TablesInsert<T>;
export type TableUpdate<T extends keyof Database['public']['Tables']> = TablesUpdate<T>;

export type RpcName = keyof Database['public']['Functions'];
