import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { startTimer } from '@/data/perf';
import { NowPlayingShelf } from '@/features/library/now-playing-shelf';
import { DEFAULT_GRID_STATUS, FilterBar } from '@/ui/components/filter-bar';
import type { LibraryFilters } from '@/ui/components/filter-bar';
import { LibraryGrid } from '@/ui/components/library-grid';
import { STATUS_LABEL } from '@/ui/labels';
import { RoundButton } from '@/ui/components/pill-button';
import { useTabBarSpace } from '@/ui/components/tab-bar';
import { space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

/** Newest release counts from this year: a game due next year isn't "newest" yet. */
const endOfThisYear = (): string => `${String(new Date().getFullYear())}-12-31`;

const LibraryScreen = () => {
  const { colors } = useTheme();
  const tabBarSpace = useTabBarSpace();
  const [filters, setFilters] = useState<LibraryFilters>({
    status: DEFAULT_GRID_STATUS,
    sort: 'released',
  });
  // Times a filter change until its first page is on screen (T19).
  const filterTimer = useRef<(() => void) | null>(null);
  const changeFilters = (next: LibraryFilters) => {
    filterTimer.current = startTimer('filter');
    setFilters(next);
  };
  const onShown = useCallback(() => {
    filterTimer.current?.();
    filterTimer.current = null;
  }, []);

  return (
    <SafeAreaView edges={['top']} style={styles.page}>
      <View style={styles.head}>
        <Text style={[type.display, { color: colors.text }]} accessibilityRole="header">
          Library
        </Text>
        <View style={styles.actions}>
          <RoundButton
            icon="person-outline"
            label="Account"
            onPress={() => router.push('/account')}
          />
          <RoundButton
            icon="archive-outline"
            label="Archive"
            onPress={() => router.push('/archive')}
          />
          <RoundButton
            icon="construct-outline"
            label="Debug"
            onPress={() => router.push('/debug')}
          />
        </View>
      </View>

      <LibraryGrid
        bottomInset={tabBarSpace}
        onShown={onShown}
        filters={{ ...filters, releasedBy: endOfThisYear() }}
        // Scrolls away with the grid, so the covers get the whole screen.
        header={
          <View style={styles.header}>
            <NowPlayingShelf />
            <FilterBar filters={filters} onChange={changeFilters} />
          </View>
        }
        empty={
          <View style={styles.empty}>
            <Text style={[type.body, { color: colors.muted }]}>
              {`Nothing in ${STATUS_LABEL[filters.status]} yet. Find a game in Search, or change a game’s status.`}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  actions: { flexDirection: 'row', gap: space.sm },
  // Out to the screen edges: the grid's own inset would double the shelf's.
  header: { marginHorizontal: -space.md, paddingBottom: space.sm },
  empty: { padding: space.lg },
});

export default LibraryScreen;
