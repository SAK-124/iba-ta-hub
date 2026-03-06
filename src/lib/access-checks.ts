import { supabase } from '@/integrations/supabase/client';

const ACCESS_CACHE_TTL_MS = 60_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const taAllowlistCache = new Map<string, CacheEntry<boolean>>();
const rosterCache = new Map<string, CacheEntry<{ found: boolean; student_name?: string; class_no?: string }>>();
let rosterVerificationCache: CacheEntry<boolean> | null = null;

const now = () => Date.now();

const getCachedValue = <T>(entry: CacheEntry<T> | undefined | null): T | null => {
  if (!entry) return null;
  if (entry.expiresAt < now()) return null;
  return entry.value;
};

export const clearAccessChecksCache = () => {
  taAllowlistCache.clear();
  rosterCache.clear();
  rosterVerificationCache = null;
};

export const checkTaAllowlistCached = async (email: string): Promise<boolean> => {
  const key = email.trim().toLowerCase();
  if (!key) return false;

  const cached = getCachedValue(taAllowlistCache.get(key));
  if (cached !== null) {
    return cached;
  }

  const { data, error } = await supabase.rpc('check_ta_allowlist', { check_email: key });
  if (error) {
    return false;
  }

  const allowed = Boolean(data);
  taAllowlistCache.set(key, { value: allowed, expiresAt: now() + ACCESS_CACHE_TTL_MS });
  return allowed;
};

export const isRosterVerificationEnabledCached = async (): Promise<boolean> => {
  const cached = getCachedValue(rosterVerificationCache);
  if (cached !== null) {
    return cached;
  }

  const { data, error } = await supabase.from('app_settings').select('roster_verification_enabled').single();
  if (error) {
    return true;
  }

  const enabled = data?.roster_verification_enabled ?? true;
  rosterVerificationCache = { value: enabled, expiresAt: now() + ACCESS_CACHE_TTL_MS };
  return enabled;
};

export const checkRosterCached = async (
  erp: string,
): Promise<{ found: boolean; student_name?: string; class_no?: string }> => {
  const key = erp.trim();
  if (!key) return { found: false };

  const cached = getCachedValue(rosterCache.get(key));
  if (cached) {
    return cached;
  }

  const { data, error } = await supabase.rpc('check_roster', { check_erp: key });
  if (error) {
    return { found: false };
  }

  const result = (data ?? { found: false }) as { found: boolean; student_name?: string; class_no?: string };
  rosterCache.set(key, { value: result, expiresAt: now() + ACCESS_CACHE_TTL_MS });
  return result;
};
