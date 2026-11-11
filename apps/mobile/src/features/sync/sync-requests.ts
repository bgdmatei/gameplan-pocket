type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * Asks for a sync now, from code that can't reach the scheduler (it lives in
 * `SyncTriggers`, one per database), such as signing in. Nothing listening,
 * nothing happens: the next trigger syncs anyway.
 */
export const requestSync = (): void => {
  for (const listener of listeners) listener();
};

/** For `SyncTriggers`; returns the function that stops listening. */
export const onSyncRequest = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
