import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { startTimer } from '@/data/perf';
import { NowPlayingShelf } from '@/features/library/now-playing-shelf';
import { DEFAULT_GRID_STATUS, FilterBar } from '@/ui/components/filter-bar';
import type { LibraryFilters } from '@/ui/components/filter-bar';
import { LibraryGrid } from '@/ui/components/library-grid';
import { STATUS_LABEL } from '@/ui/labels';
import { PressableScale } from '@/ui/components/pressable-scale';
import { useTabBarSpace } from '@/ui/components/tab-bar';
import { minTouchTarget, space, type } from '@/ui/theme';
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
        <Text style={[type.largeTitle, { color: colors.text }]} accessibilityRole="header">
          Library
        </Text>
        <View style={styles.actions}>
          <Link href="/account" asChild>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Account"
              style={styles.icon}
            >
              <Ionicons name="person-circle-outline" size={26} color={colors.accent} />
            </PressableScale>
          </Link>
          <Link href="/archive" asChild>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Archive"
              style={styles.icon}
            >
              <Ionicons name="archive-outline" size={24} color={colors.accent} />
            </PressableScale>
          </Link>
          <Link href="/debug" asChild>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Debug"
              style={styles.icon}
            >
              <Ionicons name="construct-outline" size={22} color={colors.muted} />
            </PressableScale>
          </Link>
        </View>
      </View>

      <NowPlayingShelf />

      <FilterBar filters={filters} onChange={changeFilters} />

      <LibraryGrid
        bottomInset={tabBarSpace}
        onShown={onShown}
        filters={{ ...filters, releasedBy: endOfThisYear() }}
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
  },
  actions: { flexDirection: 'row', gap: space.xs },
  icon: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { padding: space.lg },
});

export default LibraryScreen;
