import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccessCheckError,
  checkRosterCached,
  checkTaAllowlistCached,
  clearAccessChecksCache,
} from './access-checks';

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: rpcMock },
}));

describe('access checks', () => {
  beforeEach(() => {
    clearAccessChecksCache();
    rpcMock.mockReset();
  });

  it('keeps a genuine TA allowlist miss as unauthorized', async () => {
    rpcMock.mockResolvedValueOnce({ data: false, error: null });

    await expect(checkTaAllowlistCached('not-a-ta@example.com')).resolves.toBe(false);
  });

  it('surfaces TA allowlist backend failures distinctly', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'network unavailable' } });

    await expect(checkTaAllowlistCached('ta@example.com')).rejects.toMatchObject<Partial<AccessCheckError>>({
      name: 'AccessCheckError',
      operation: 'ta-allowlist',
    });
  });

  it('keeps a genuine roster miss as not found', async () => {
    rpcMock.mockResolvedValueOnce({ data: { found: false }, error: null });

    await expect(checkRosterCached('12345')).resolves.toEqual({ found: false });
  });

  it('surfaces roster backend failures distinctly', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'service unavailable' } });

    await expect(checkRosterCached('12345')).rejects.toMatchObject<Partial<AccessCheckError>>({
      name: 'AccessCheckError',
      operation: 'roster',
    });
  });
});
