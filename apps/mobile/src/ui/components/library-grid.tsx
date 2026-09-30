import type { ListLibraryOptions } from '@gameplan/storage';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback } from 'react';
import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLibraryPages } from '@/data/use-library-pages';
import { space } from '../theme';
import { CoverCell } from './cover-cell';
import { LoadFailed } from './load-failed';
import { CoverGridSkeleton } from './skeleton';

type Props = {
  filters: Omit<ListLibraryOptions, 'limit' | 'cursor'>;
  header?: ReactElement;
  /** Shown when nothing matches. */
  empty: ReactElement;
};

/** The library as a cover grid, paged as the user scrolls. Shared by Library and Archive. */
export const LibraryGrid = ({ filters, header, empty }: Props) => {
  const { state, loadMore } = useLibraryPages(filters);

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
      renderItem={({ item }) => <CoverCell row={item} onPress={open} />}
      onEndReached={loadMore}
      onEndReachedThreshold={1}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      contentContainerStyle={styles.content}
    />
  );
};

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.md, paddingBottom: space.xl },
  placeholder: { flex: 1 },
});
