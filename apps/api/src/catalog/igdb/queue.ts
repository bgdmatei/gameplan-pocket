/** IGDB's published limits (confirm against its current docs in T9). */
export const IGDB_LIMITS = { perSecond: 4, maxInFlight: 8, maxWaiting: 20 } as const;

const WINDOW_MS = 1_000;

/** The queue is full: the caller should answer from cache rather than wait. */
export class QueueFullError extends Error {
  constructor() {
    super('The IGDB queue is full.');
    this.name = 'QueueFullError';
  }
}

export type RateLimitedQueue = { run: <T>(task: () => Promise<T>) => Promise<T> };

export type QueueOptions = {
  perSecond: number;
  maxInFlight: number;
  maxWaiting: number;
  now?: () => number;
};

/**
 * Every IGDB request goes through one of these.
 *
 * A sliding window, not a token bucket: a task starts only when fewer than
 * `perSecond` started in the last second, which holds for *any* one-second
 * span. A bucket of 4 refilling at 4/s would let 7 start within one second.
 *
 * At most `maxWaiting` tasks wait. Beyond that a task is refused at once, so a
 * flood of distinct searches cannot build a backlog nobody will wait for.
 */
export const createRateLimitedQueue = ({
  perSecond,
  maxInFlight,
  maxWaiting,
  now = Date.now,
}: QueueOptions): RateLimitedQueue => {
  const waiting: (() => void)[] = [];
  let starts: number[] = [];
  let inFlight = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const pump = (): void => {
    const time = now();
    starts = starts.filter((start) => start > time - WINDOW_MS);

    while (waiting.length > 0 && inFlight < maxInFlight && starts.length < perSecond) {
      starts.push(time);
      inFlight += 1;
      waiting.shift()?.();
    }

    // Blocked by the window, not by in-flight work: wake when the oldest
    // start leaves it. A finishing task calls pump itself.
    const oldest = starts[0];
    if (waiting.length > 0 && inFlight < maxInFlight && oldest !== undefined && timer === null) {
      timer = setTimeout(
        () => {
          timer = null;
          pump();
        },
        oldest + WINDOW_MS - time,
      );
    }
  };

  return {
    run: (task) => {
      if (waiting.length >= maxWaiting) return Promise.reject(new QueueFullError());

      return new Promise((resolve, reject) => {
        waiting.push(() => {
          task()
            .then(resolve, reject)
            .finally(() => {
              inFlight -= 1;
              pump();
            });
        });
        pump();
      });
    },
  };
};
