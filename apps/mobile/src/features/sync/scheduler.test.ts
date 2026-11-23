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
    pulledSeq: async () => 0,
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

  it('stops for good once the server says the app is too old', async () => {
    const old = harness(() => Promise.reject(new SyncRequestError('update_required')));
    await old.scheduler.start();
    old.scheduler.edited();
    await old.scheduler.networkBack();
    await old.scheduler.start();
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.intervalMs * 2);
    expect(old.calls).toHaveLength(1);
    expect(old.failures).toEqual(['update_required']);
    old.scheduler.stop();
  });

  describe('pokes', () => {
    /** A server log at `server`; each run takes 1 s and pulls what was there when it began. */
    const pokeHarness = (pulledAtStart = 0) => {
      let server = pulledAtStart;
      let pulled = pulledAtStart;
      const calls: number[] = [];
      const scheduler = createSyncScheduler({
        sync: async () => {
          calls.push(Date.now());
          const reached = server;
          await new Promise((resolve) => setTimeout(resolve, 1_000));
          pulled = reached;
        },
        signedIn: async () => true,
        pulledSeq: async () => pulled,
      });
      const push = (seq: number) => {
        server = seq;
      };
      return { scheduler, calls, push };
    };

    // The run in flight pulled before the poke's ops were written: without
    // the trailing run, the edit would wait for the 5-minute timer.
    it('runs exactly once more for a poke that arrives during a run', async () => {
      const { scheduler, calls, push } = pokeHarness();

      void scheduler.syncNow();
      await vi.advanceTimersByTimeAsync(500);
      push(5);
      void scheduler.poked(5);
      await vi.advanceTimersByTimeAsync(60_000);

      expect(calls).toEqual([0, 1_000]);
    });

    // The phone's own push comes back as a poke at a position it already pulled.
    it('does nothing for a poke at or below the pulled position', async () => {
      const { scheduler, calls } = pokeHarness(7);

      await scheduler.poked(7);
      await scheduler.poked(3);
      await vi.advanceTimersByTimeAsync(60_000);

      expect(calls).toEqual([]);
    });

    // Every edit would otherwise sync twice: the echo arrives before the
    // run that pushed it has saved how far it pulled.
    it('does nothing for its own push, echoed back while that run is still going', async () => {
      const { scheduler, calls, push } = pokeHarness();

      push(5);
      void scheduler.syncNow();
      await vi.advanceTimersByTimeAsync(500);
      void scheduler.poked(5);
      await vi.advanceTimersByTimeAsync(60_000);

      expect(calls).toEqual([0]);
    });
  });
});
