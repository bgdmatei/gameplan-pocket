import type { StorageAdapter } from '@gameplan/storage';
import { useEffect, useState } from 'react';
import { useDatabase } from './database';
import { createQueryRunner } from './query-runner';
import type { QueryState } from './query-runner';

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
): QueryState<T> => {
  const adapter = useDatabase();
  const [state, setState] = useState<QueryState<T>>({ status: 'loading' });

  // `query` is a new closure every render; `deps` says when it really changed.
  useEffect(() => createQueryRunner(adapter, query, tables, setState), [adapter, ...deps]);

  return state;
};
