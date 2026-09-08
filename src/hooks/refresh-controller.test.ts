import { describe, expect, it, vi } from 'vitest';
import { createRefreshController } from './refresh-controller';

describe('createRefreshController', () => {
  it('coalesces overlapping requests into one trailing rerun', async () => {
    const releases: Array<() => void> = [];
    const refresh = vi.fn(() => new Promise<void>((resolve) => { releases.push(resolve); }));
    const controller = createRefreshController(refresh);

    const first = controller.request('initial');
    await Promise.resolve();
    const second = controller.request('background');
    const third = controller.request('background');
    expect(refresh).toHaveBeenCalledTimes(1);

    releases[0]();
    await Promise.resolve();
    releases[1]();
    await first;
    await second;
    await third;
    await Promise.resolve();
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(refresh.mock.calls[1][0]).toBe('background');
  });

  it('shows Updating only after the delay and clears it when complete', async () => {
    vi.useFakeTimers();
    let release: (() => void) | undefined;
    const controller = createRefreshController(
      () => new Promise<void>((resolve) => { release = resolve; }),
      { updatingDelayMs: 500 },
    );
    const states = [] as boolean[];
    controller.subscribe((state) => states.push(state.updating));
    const request = controller.request('background');
    await vi.advanceTimersByTimeAsync(499);
    expect(states.at(-1)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(states.at(-1)).toBe(true);
    release!();
    await request;
    expect(states.at(-1)).toBe(false);
    vi.useRealTimers();
  });
});
