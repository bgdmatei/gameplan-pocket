export type SingleFlight = (task: () => Promise<void>) => Promise<void>;

/**
 * Runs one task at a time. A call made while a task runs does not start a
 * second one alongside it: all such calls share one trailing run, started
 * when the current one finishes, so no trigger that arrives mid-sync is lost
 * and two syncs never overlap on one device (plan §5.8).
 *
 * The tasks are assumed interchangeable (it is always "sync now"); the
 * trailing run uses the task of the first call that asked for it.
 */
export const createSingleFlight = (): SingleFlight => {
  let running: Promise<void> | null = null;
  let trailing: Promise<void> | null = null;

  const run: SingleFlight = (task) => {
    if (running === null) {
      running = task().finally(() => {
        running = null;
      });
      return running;
    }

    // A failed run must not stop the one queued behind it.
    trailing ??= running
      .catch(() => undefined)
      .then(() => {
        trailing = null;
        return run(task);
      });
    return trailing;
  };

  return run;
};
