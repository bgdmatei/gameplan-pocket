/** `byPlayer`: a tap on the sync icon, whose run shows even while an error holds. */
type Listener = (request: { byPlayer: boolean }) => void;

const listeners = new Set<Listener>();

/**
 * Asks for a sync now, from code that can't reach the scheduler (it lives in
 * `SyncTriggers`, one per database): signing in, or the sync icon. Nothing
 * listening, nothing happens: the next trigger syncs anyway.
 */
export const requestSync = (request: { byPlayer: boolean } = { byPlayer: false }): void => {
  for (const listener of listeners) listener(request);
};

/** For `SyncTriggers`; returns the function that stops listening. */
export const onSyncRequest = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
