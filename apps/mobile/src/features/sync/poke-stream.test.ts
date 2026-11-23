import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncEvents, SyncEventsEnd } from '../../data/sync-events';
import { createPokeStream } from './poke-stream';

/** A server whose streams end, one after another, as `ends` says; then stay open. */
const fakeEvents = (ends: SyncEventsEnd[]) => {
  const opened: number[] = [];
  const events: SyncEvents = {
    open: (_onPoke, signal) => {
      opened.push(Date.now());
      const end = ends.shift();
      if (end !== undefined) return Promise.resolve(end);
      return new Promise((resolve) => {
        signal.addEventListener('abort', () => resolve('stopped'));
      });
    },
  };
  return { events, opened };
};

const stream = (events: SyncEvents) =>
  createPokeStream({
    events,
    onPoke: () => undefined,
    signedIn: async () => true,
    random: () => 1,
  });

describe('poke stream', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reconnects after drops with backoff, until closed', async () => {
    const { events, opened } = fakeEvents(['offline', 'offline', 'failed']);
    const pokes = stream(events);

    pokes.open();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(opened).toEqual([0, 1_000, 3_000, 7_000]);

    pokes.close();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(opened).toHaveLength(4);
  });

  it('stays closed once the app is too old', async () => {
    const { events, opened } = fakeEvents(['update_required']);

    const pokes = stream(events);
    pokes.open();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    pokes.open();
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(opened).toEqual([0]);
  });
});
