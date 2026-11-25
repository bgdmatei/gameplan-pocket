import { createSingleFlight } from '@gameplan/sync';
import { SyncRequestError } from '../../data/sync-api';

/** SPEC-sync-transport.md: when sync runs on its own. */
export const SYNC_TIMING = {
  editDebounceMs: 2_000,
  intervalMs: 5 * 60_000,
  backoffBaseMs: 1_000,
  backoffMaxMs: 5 * 60_000,
  /** The poke stream reconnects sooner: a minute without it is a minute of missed edits. */
  streamBackoffMaxMs: 60_000,
} as const;

/**
 * The wait before retry `failures` (1, 2, …): 1 s doubling, capped at `maxMs` (5 min),
 * with "equal jitter", so a fleet that failed together doesn't retry together
 * yet no retry comes sooner than half the step.
 */
export const backoffDelay = (
  failures: number,
  random: () => number,
  maxMs: number = SYNC_TIMING.backoffMaxMs,
): number => {
  const step = Math.min(maxMs, SYNC_TIMING.backoffBaseMs * 2 ** Math.max(0, failures - 1));
  return step / 2 + (random() * step) / 2;
};

/** Retrying can't help: no sign-in to sync for, or an app the server no longer serves. */
const FINAL = new Set(['signed_out', 'ended', 'update_required']);

const kindOf = (error: unknown): string | null =>
  error instanceof SyncRequestError ? error.kind : null;

const isFinal = (error: unknown): boolean => FINAL.has(kindOf(error) ?? '');

export type SchedulerOptions = {
  sync: () => Promise<void>;
  signedIn: () => Promise<boolean>;
  /** How far this device has pulled the server's log, to tell a poke it hasn't seen. */
  pulledSeq: () => Promise<number>;
  random?: () => number;
  /** After each sync that ran and finished. */
  onSuccess?: () => void;
  /** A sync that was asked for but didn't run: signed out, or stopped. */
  onSkip?: () => void;
  /**
   * Told the kind of each failure, never its contents, and whether a retry
   * follows (not once the session has ended, or the scheduler stopped).
   */
  onFailure?: (kind: string, retrying: boolean) => void;
};

/**
 * Decides when to sync: on start (launch, foreground), after the network
 * returns, 2 s after the last local edit, every 5 minutes until stopped, and
 * again after a failure with backoff. Runs are single-flight (a call during a
 * run shares one trailing run: packages/sync single-flight.ts), and only while
 * signed in.
 *
 * While a retry is waiting, edits and the interval leave it be, so a failing
 * server or no network doesn't turn every keystroke into another failed
 * request; network-back runs at once and forgets the failures.
 */
export const createSyncScheduler = ({
  sync,
  signedIn,
  pulledSeq,
  random = Math.random,
  onSuccess = () => undefined,
  onSkip = () => undefined,
  onFailure = () => undefined,
}: SchedulerOptions) => {
  const flight = createSingleFlight();
  let failures = 0;
  let stopped = false;
  // Only a new launch, with a newer build, can sync again.
  let outdated = false;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let edit: ReturnType<typeof setTimeout> | null = null;
  let interval: ReturnType<typeof setTimeout> | null = null;
  // The sync running now, if any: a poke waits for it before deciding.
  let running: Promise<void> | null = null;
  const tracked = async (): Promise<void> => {
    running = sync();
    try {
      await running;
    } finally {
      running = null;
    }
  };

  const clear = (timer: ReturnType<typeof setTimeout> | null): null => {
    if (timer !== null) clearTimeout(timer);
    return null;
  };

  const attempt = async (): Promise<void> => {
    if (stopped || outdated) {
      onSkip();
      return;
    }
    try {
      // Stopped while the session was read (the app went to the background).
      if (!(await signedIn()) || stopped) {
        onSkip();
        return;
      }
      await flight(tracked);
      failures = 0;
      // A run that failed alongside this one may have queued a retry for nothing.
      retry = clear(retry);
      onSuccess();
    } catch (error) {
      if (kindOf(error) === 'update_required') {
        outdated = true;
        edit = clear(edit);
        interval = clear(interval);
      }
      onFailure(
        error instanceof SyncRequestError ? error.kind : 'error',
        !stopped && !isFinal(error),
      );
      // Callers sharing one failed run schedule one retry between them.
      if (stopped || isFinal(error) || retry !== null) return;
      failures += 1;
      retry = setTimeout(
        () => {
          retry = null;
          void attempt();
        },
        backoffDelay(failures, random),
      );
    }
  };

  const now = (): Promise<void> => {
    retry = clear(retry);
    return attempt();
  };

  /** Unless a retry is already waiting to do the same. */
  const soon = (): Promise<void> => (retry === null ? attempt() : Promise.resolve());

  const tick = () => {
    if (outdated) return;
    interval = setTimeout(() => {
      void soon();
      tick();
    }, SYNC_TIMING.intervalMs);
  };

  return {
    /** Launch or foreground: sync now, then every 5 minutes until stopped. */
    start: (): Promise<void> => {
      stopped = false;
      interval = clear(interval);
      tick();
      return now();
    },
    networkBack: (): Promise<void> => {
      failures = 0;
      return now();
    },
    /** A local edit: sync once edits pause for 2 s. */
    edited: (): void => {
      if (outdated) return;
      edit = clear(edit);
      edit = setTimeout(() => {
        edit = null;
        void soon();
      }, SYNC_TIMING.editDebounceMs);
    },
    /**
     * The server's log reached `seq`: sync, unless this device has pulled that
     * far. A run in flight is waited for first: it may be about to pull that
     * far (this phone's own push echoed back, or the poke a stream opens
     * with), or it may have pulled before the poke's ops were written.
     */
    poked: async (seq: number): Promise<void> => {
      try {
        await running?.catch(() => undefined);
        if (stopped || outdated || seq <= (await pulledSeq())) return;
      } catch {
        // The database closed (an erase): nothing to sync into.
        return;
      }
      if (!stopped) await soon();
    },
    /** Sync at once, as after signing in. */
    syncNow: now,
    /** Background or unmount: nothing runs until the next start. */
    stop: (): void => {
      stopped = true;
      retry = clear(retry);
      edit = clear(edit);
      interval = clear(interval);
    },
  };
};

export type SyncScheduler = ReturnType<typeof createSyncScheduler>;
