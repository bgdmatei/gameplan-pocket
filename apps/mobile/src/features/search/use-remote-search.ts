import { useEffect, useState } from 'react';
import { catalogApi } from '@/data/catalog-api';
import type { RemoteSearch } from './merge';

const DEBOUNCE_MS = 250;

/**
 * Asks the server once typing pauses (plan §8.2: local search per keystroke,
 * remote debounced). A newer query aborts the older request, so answers can't
 * arrive out of order. `null` means there is nothing to ask.
 */
export const useRemoteSearch = (query: string | null): RemoteSearch => {
  const [state, setState] = useState<RemoteSearch>({ kind: 'waiting' });

  useEffect(() => {
    setState({ kind: 'waiting' });
    if (query === null) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      void catalogApi.search(query, { signal: controller.signal }).then((result) => {
        if (result.kind !== 'superseded') setState(result);
      });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return state;
};
