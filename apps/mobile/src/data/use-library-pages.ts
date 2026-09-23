import { LIBRARY_ENTRY_TABLES, listLibraryGrid } from '@gameplan/storage';
import type { LibraryPage, ListLibraryOptions } from '@gameplan/storage';
import { useState } from 'react';
import type { QueryState } from './query-runner';
import { useQuery } from './use-query';

const PAGE_SIZE = 60;

type Filters = Omit<ListLibraryOptions, 'limit' | 'cursor'>;

/**
 * The library grid, growing a page at a time as the user scrolls.
 *
 * Rather than stitching pages together, it re-reads everything loaded so far
 * as one query from the top (`limit` grows by a page). After an edit or a
 * sync, the rows on screen are one consistent read: a row can't appear twice
 * or vanish between pages, and keyset paging keeps even 1,000 rows at a few
 * milliseconds. A filter change starts again from one page.
 */
export const useLibraryPages = (
  filters: Filters,
): { state: QueryState<LibraryPage>; loadMore: () => void } => {
  const key = JSON.stringify(filters);
  const [paging, setPaging] = useState({ key, pages: 1 });
  const pages = paging.key === key ? paging.pages : 1;

  const state = useQuery(
    (adapter) => listLibraryGrid(adapter, { ...filters, limit: PAGE_SIZE * pages }),
    LIBRARY_ENTRY_TABLES,
    [key, pages],
  );

  const hasMore = state.status === 'ready' && state.data.nextCursor !== undefined;
  const loadMore = (): void => {
    if (hasMore) setPaging({ key, pages: pages + 1 });
  };

  return { state, loadMore };
};
