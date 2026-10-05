import { CATALOG_TABLES, getReference } from '@gameplan/storage';
import type { ListLibraryOptions } from '@gameplan/storage';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLibraryPages } from '@/data/use-library-pages';
import { createScrollFpsMeter, markLibraryInteractive } from '@/data/perf';
import { useQuery } from '@/data/use-query';
import { platformLabelById } from '../platforms';
import { space } from '../theme';
import { CoverCell } from './cover-cell';
import { LoadFailed } from './load-failed';
import { CoverGridSkeleton } from './skeleton';

type Props = {
  filters: Omit<ListLibraryOptions, 'limit' | 'cursor'>;
  header?: ReactElement;
  /** Shown when nothing matches. */
  empty: ReactElement;
  /** Extra room at the end, for a grid pushed over the tab bar down to the home indicator. */
  bottomInset?: number;
  /** Called when a page of results is ready, for timing filter changes. */
  onShown?: () => void;
};

/** The library as a cover grid, paged as the user scrolls. Shared by Library and Archive. */
export const LibraryGrid = ({ filters, header, empty, bottomInset = 0, onShown }: Props) => {
  const { state, loadMore } = useLibraryPages(filters);
  const reference = useQuery(getReference, CATALOG_TABLES, []);
  const known = reference.status === 'ready' ? reference.data.platforms : [];
  const [onScroll] = useState(createScrollFpsMeter);

  useEffect(() => {
    if (state.status !== 'ready') return;
    markLibraryInteractive();
    onShown?.();
  }, [state, onShown]);

  const open = useCallback((gameId: number) => {
    router.push({ pathname: '/game/[id]', params: { id: String(gameId) } });
  }, []);

  if (state.status !== 'ready') {
    return (
      <View style={styles.placeholder}>
        {header}
        {state.status === 'loading' ? (
          <CoverGridSkeleton />
        ) : (
          <LoadFailed message="Your games couldn’t be read." onRetry={state.retry} />
        )}
      </View>
    );
  }

  return (
    <FlashList
      data={state.data.rows}
      numColumns={3}
      keyExtractor={(row) => row.id}
      renderItem={({ item }) => (
        <CoverCell
          row={item}
          onPress={open}
          showStatus={filters.status === undefined}
          platform={platformLabelById(item.platformId, known)}
        />
      )}
      onScroll={onScroll}
      onEndReached={loadMore}
      onEndReachedThreshold={1}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      contentContainerStyle={{ ...styles.content, paddingBottom: space.xl + bottomInset }}
    />
  );
};

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.md },
  placeholder: { flex: 1 },
});
