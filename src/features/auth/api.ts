import { supabase } from '@/integrations/supabase/client';

export const getSession = async () => {
  const { data } = await supabase.auth.getSession();
  return data.session;
};
