import type { ListLibraryOptions } from '@gameplan/storage';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback } from 'react';
import type { ReactElement } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLibraryPages } from '@/data/use-library-pages';
import { space } from '../theme';
import { useTheme } from '../use-theme';
import { CoverCell } from './cover-cell';

type Props = {
  filters: Omit<ListLibraryOptions, 'limit' | 'cursor'>;
  header?: ReactElement;
  /** Shown when nothing matches. */
  empty: ReactElement;
};

/** The library as a cover grid, paged as the user scrolls. Shared by Library and Archive. */
export const LibraryGrid = ({ filters, header, empty }: Props) => {
  const { colors } = useTheme();
  const { state, loadMore } = useLibraryPages(filters);

  const open = useCallback((gameId: number) => {
    router.push({ pathname: '/game/[id]', params: { id: String(gameId) } });
  }, []);

  if (state.status === 'loading') {
    return (
      <View style={styles.centred}>
        {header}
        <ActivityIndicator color={colors.accent} accessibilityLabel="Loading your library" />
      </View>
    );
  }

  return (
    <FlashList
      data={state.status === 'ready' ? state.data.rows : []}
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
  centred: { flex: 1, gap: space.xl },
});
