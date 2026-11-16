import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncRequestError } from '../../data/sync-api';
import { SYNC_TIMING, backoffDelay, createSyncScheduler } from './scheduler';

/** Sync calls, timestamped by the fake clock. */
const harness = (
  outcome: () => Promise<void> = async () => undefined,
  signedIn = async () => true,
) => {
  const calls: number[] = [];
  const failures: string[] = [];
  const scheduler = createSyncScheduler({
    onFailure: (kind, retrying) => failures.push(`${kind}${retrying ? ', retrying' : ''}`),
    sync: async () => {
      calls.push(Date.now());
      await outcome();
    },
    signedIn,
    // The top of each jitter range, so delays are exact.
    random: () => 1,
  });
  return { scheduler, calls, failures };
};

describe('sync scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('syncs once, 2 s after the last of a burst of edits', async () => {
    const { scheduler, calls } = harness();

    scheduler.edited();
    await vi.advanceTimersByTimeAsync(1_500);
    scheduler.edited();
    await vi.advanceTimersByTimeAsync(1_500);
    scheduler.edited();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(calls).toEqual([3_000 + SYNC_TIMING.editDebounceMs]);
  });

  it('backs off 1 s doubling to 5 min, and starts over when the network returns', async () => {
    const { scheduler, calls, failures } = harness(() =>
      Promise.reject(new SyncRequestError('offline')),
    );

    await scheduler.networkBack();
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    const waits = calls.slice(1).map((at, i) => at - (calls[i] ?? 0));
    expect(waits.slice(0, 10)).toEqual([
      1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 128_000, 256_000, 300_000,
    ]);
    // The reconnect toast says "retrying" only because one is coming.
    expect(failures[0]).toBe('offline, retrying');

    // Edits don't jump the queue while a retry waits; the network does.
    const before = calls.length;
    scheduler.edited();
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.editDebounceMs);
    expect(calls).toHaveLength(before);
    await scheduler.networkBack();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls.slice(before).map((at) => at - Date.now())).toEqual([-1_000, 0]);
    scheduler.stop();
  });

  it('jitters each wait within the top half of its step', () => {
    expect([backoffDelay(1, () => 0), backoffDelay(1, () => 1)]).toEqual([500, 1_000]);
    expect(backoffDelay(30, () => 0.5)).toBe(225_000);
  });

  // SPEC-sync-transport.md criterion 9: a signed-out app sends no sync request.
  it('runs nothing while signed out, and stops retrying once the session ends', async () => {
    const out = harness(undefined, async () => false);
    await out.scheduler.start();
    out.scheduler.edited();
    await out.scheduler.networkBack();
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.intervalMs * 2);
    expect(out.calls).toEqual([]);
    out.scheduler.stop();

    const ended = harness(() => Promise.reject(new SyncRequestError('ended')));
    await ended.scheduler.networkBack();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(ended.calls).toHaveLength(1);
    expect(ended.failures).toEqual(['ended']);
  });
});
