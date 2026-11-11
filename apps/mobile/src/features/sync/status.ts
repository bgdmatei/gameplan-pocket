/**
 * What sync is doing, as the scheduler and the network report it. The
 * database holds the rest (when it last synced, what is queued); this holds
 * only what the database can't: a sync running, the connection, the last
 * failure. One store for the app: there is one scheduler at a time.
 */
export type SyncPhase = 'synced' | 'syncing' | 'offline' | 'error';

/** Facts, not the phase: the phase is derived, so no event order can leave it stale. */
export type SyncActivity = {
  connected: boolean;
  running: boolean;
  /** The last run failed for a reason a retry may fix (not a session that ended). */
  failing: boolean;
  /** The last failure's kind ('failed', 'ended', …) and when; never its contents. */
  lastError: { kind: string; at: string } | null;
};

export type SyncEvent =
  | { type: 'started' }
  | { type: 'succeeded' }
  | { type: 'failed'; kind: string; at: string }
  | { type: 'went_offline' }
  | { type: 'came_online' };

export const INITIAL_ACTIVITY: SyncActivity = {
  connected: true,
  running: false,
  failing: false,
  lastError: null,
};

/**
 * Not errors to show: a session that ended (or none) means sync simply doesn't
 * run until the next sign-in. An `offline` failure is one: with the phone
 * connected it means the server can't be reached, and a retry is on it; with
 * the connection gone, the offline phase shows instead.
 */
const NOT_ERRORS = new Set(['signed_out', 'ended']);

export const reduceSyncActivity = (state: SyncActivity, event: SyncEvent): SyncActivity => {
  switch (event.type) {
    case 'started':
      return state.running ? state : { ...state, running: true };
    case 'succeeded':
      return { ...state, running: false, failing: false };
    case 'failed':
      return {
        ...state,
        running: false,
        failing: !NOT_ERRORS.has(event.kind),
        lastError: { kind: event.kind, at: event.at },
      };
    case 'went_offline':
      return state.connected ? { ...state, connected: false } : state;
    case 'came_online':
      return state.connected ? state : { ...state, connected: true };
  }
};

/**
 * Offline wins (nothing can sync); then a run in progress; then an error a
 * retry is working on. "synced" means idle with nothing wrong: whether it
 * ever synced is `lastSyncedAt`'s to say (`useSyncStatus`).
 */
export const phaseOf = (state: SyncActivity): SyncPhase => {
  if (!state.connected) return 'offline';
  if (state.running) return 'syncing';
  return state.failing ? 'error' : 'synced';
};

/** A store React reads with `useSyncExternalStore`. */
export const createSyncActivityStore = () => {
  let state = INITIAL_ACTIVITY;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  return {
    get: (): SyncActivity => state,
    dispatch: (event: SyncEvent): void => {
      const next = reduceSyncActivity(state, event);
      if (next === state) return;
      state = next;
      notify();
    },
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** A fresh database (after an erase) starts from nothing known. */
    reset: (): void => {
      state = INITIAL_ACTIVITY;
      notify();
    },
  };
};

export const syncActivity = createSyncActivityStore();
