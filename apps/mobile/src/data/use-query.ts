import type { StorageAdapter } from '@gameplan/storage';
import { useEffect, useState } from 'react';
import { useDatabase } from './database';
import { createQueryRunner } from './query-runner';
import type { QueryState } from './query-runner';

/** A query's state on screen: a failed one can be asked to run again. */
export type LiveQueryState<T> =
  | Exclude<QueryState<T>, { status: 'failed' }>
  | (Extract<QueryState<T>, { status: 'failed' }> & { retry: () => void });

/**
 * A screen's view of a query: runs it, and runs it again whenever one of
 * `tables` changes or `deps` do. SQLite is the only cache.
 *
 * On a change the previous result stays on screen until the new one arrives,
 * so a list never blinks empty between an edit and its re-run.
 */
export const useQuery = <T>(
  query: (adapter: StorageAdapter) => Promise<T>,
  tables: readonly string[],
  deps: readonly unknown[],
): LiveQueryState<T> => {
  const adapter = useDatabase();
  const [state, setState] = useState<QueryState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  // `query` is a new closure every render; `deps` says when it really changed.
  useEffect(() => createQueryRunner(adapter, query, tables, setState), [adapter, attempt, ...deps]);

  if (state.status !== 'failed') return state;
  return {
    ...state,
    retry: () => {
      setState({ status: 'loading' });
      setAttempt((current) => current + 1);
    },
  };
};
