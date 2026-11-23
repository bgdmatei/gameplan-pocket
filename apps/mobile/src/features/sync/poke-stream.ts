import type { SyncEvents, SyncEventsEnd } from '../../data/sync-events';
import { SYNC_TIMING, backoffDelay } from './scheduler';

/** Ends a reconnect can't fix: closed by the app, no sign-in, or an app too old. */
const FINAL = new Set<SyncEventsEnd>(['stopped', 'signed_out', 'ended', 'update_required']);

const wait = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done);
  });

/**
 * Keeps the poke stream open between `open` and `close`, reconnecting after a
 * drop with backoff (1 s doubling, capped at 60 s) until it ends for good.
 */
export const createPokeStream = ({
  events,
  onPoke,
  signedIn,
  random = Math.random,
}: {
  events: SyncEvents;
  onPoke: (seq: number) => void;
  signedIn: () => Promise<boolean>;
  random?: () => number;
}) => {
  let current: AbortController | null = null;
  // The server no longer serves this build: only a new launch opens it again.
  let retired = false;

  const run = async ({ signal }: AbortController): Promise<void> => {
    let failures = 0;
    while (!signal.aborted && (await signedIn())) {
      const openedAt = Date.now();
      const end = await events.open(onPoke, signal);
      if (end === 'update_required') retired = true;
      if (FINAL.has(end)) return;
      // A stream that lasted (closed by the server at token expiry) starts over.
      failures = Date.now() - openedAt >= SYNC_TIMING.streamBackoffMaxMs ? 1 : failures + 1;
      await wait(backoffDelay(failures, random, SYNC_TIMING.streamBackoffMaxMs), signal);
    }
  };

  return {
    /** Foreground, or a new sign-in; a stream already open is left be. */
    open: (): void => {
      if (current !== null || retired) return;
      const abort = new AbortController();
      current = abort;
      void run(abort)
        // A session read that failed: the next foreground or sign-in tries again.
        .catch(() => undefined)
        .finally(() => {
          if (current === abort) current = null;
        });
    },
    /** Background or unmount. */
    close: (): void => {
      current?.abort();
      current = null;
    },
    /** Sync found the app too old: close, and stay closed. */
    retire: (): void => {
      retired = true;
      current?.abort();
      current = null;
    },
  };
};
