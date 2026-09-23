export type SerialQueue = {
  /** Runs `task` once every task queued before it has finished. */
  run: <T>(task: () => Promise<T>) => Promise<T>;
};

/** Long enough for any real transaction on a phone; a nested call is the only thing that waits this long. */
const DEFAULT_WAIT_MS = 10_000;

/**
 * One connection runs one transaction at a time, so callers take turns rather
 * than being refused: a double tap, or a sync pull landing mid-edit, waits
 * instead of failing.
 *
 * A caller cannot be told apart from a nested call made inside the running
 * task (Hermes has no async context), and a nested call would wait for its
 * own outer task forever. So a wait is bounded: past `waitMs` it fails with a
 * message naming the likely cause, the outer task sees that failure and rolls
 * back, and the queue moves on.
 */
export const createSerialQueue = ({ waitMs = DEFAULT_WAIT_MS } = {}): SerialQueue => {
  let tail: Promise<void> = Promise.resolve();

  const run = <T>(task: () => Promise<T>): Promise<T> => {
    const previous = tail;
    let release = (): void => {};
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    return new Promise<T>((resolve, reject) => {
      let gaveUp = false;
      const timer = setTimeout(() => {
        gaveUp = true;
        reject(
          new Error(
            `Waited ${String(waitMs)} ms for another transaction to finish. If this call is ` +
              'inside a transaction, use its `tx` rather than the adapter: a transaction cannot ' +
              'wait for itself.',
          ),
        );
      }, waitMs);

      void previous.then(async () => {
        clearTimeout(timer);
        // Its turn came after it stopped waiting: pass the turn straight on.
        if (gaveUp) {
          release();
          return;
        }
        try {
          resolve(await task());
        } catch (error) {
          reject(error);
        } finally {
          release();
        }
      });
    });
  };

  return { run };
};
