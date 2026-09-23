import type { StorageAdapter } from '@gameplan/storage';

export type QueryState<T> =
  { status: 'loading' } | { status: 'ready'; data: T } | { status: 'failed'; error: unknown };

/**
 * Runs `query` now and again after every commit to one of `tables`, handing
 * each result to `onResult`. Returns a function that stops it.
 *
 * Only the newest run reports: an older, slower run finishing late would
 * otherwise put stale rows back on screen after fresher ones. Nothing reports
 * after stopping, so a screen that has gone away is never updated.
 *
 * Framework-free, so it is tested in Node; `useQuery` is a thin hook over it.
 */
export const createQueryRunner = <T>(
  adapter: StorageAdapter,
  query: (adapter: StorageAdapter) => Promise<T>,
  tables: readonly string[],
  onResult: (state: QueryState<T>) => void,
): (() => void) => {
  let latest = 0;
  let stopped = false;

  const run = (): void => {
    latest += 1;
    const current = latest;
    const report = (state: QueryState<T>): void => {
      if (!stopped && current === latest) onResult(state);
    };

    query(adapter).then(
      (data) => report({ status: 'ready', data }),
      (error: unknown) => report({ status: 'failed', error }),
    );
  };

  const unsubscribe = adapter.subscribe(tables, run);
  run();

  return () => {
    stopped = true;
    unsubscribe();
  };
};
