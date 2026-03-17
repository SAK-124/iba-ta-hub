import { describe, expect, it } from 'vitest';
import {
  getAllowedLateDayClaimOptions,
  getCurrentLateDayDeadline,
  getMinimumLateDaysRequired,
} from './logic';

describe('late-day logic', () => {
  it('uses the later of the TA deadline and claimed extension as the current deadline', () => {
    const currentDeadline = getCurrentLateDayDeadline(
      '2026-03-20T12:00:00.000Z',
      '2026-03-18T12:00:00.000Z',
    );

    expect(currentDeadline?.toISOString()).toBe('2026-03-20T12:00:00.000Z');
  });

  it('requires enough late days to cover the current lateness', () => {
    const now = new Date('2026-03-20T12:00:00.000Z');

    expect(getMinimumLateDaysRequired('2026-03-17T12:00:00.000Z', now)).toBe(3);
    expect(getMinimumLateDaysRequired('2026-03-18T12:00:00.000Z', now)).toBe(2);
  });

  it('only returns claim options when the remaining balance can still catch up to now', () => {
    const now = new Date('2026-03-20T12:00:00.000Z');

    expect(getAllowedLateDayClaimOptions('2026-03-17T12:00:00.000Z', 2, now)).toEqual([]);
    expect(getAllowedLateDayClaimOptions('2026-03-17T12:00:00.000Z', 4, now)).toEqual([3, 4]);
  });
});
