import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NowPlayingShelf } from '@/features/library/now-playing-shelf';
import { FilterBar, isFiltered } from '@/ui/components/filter-bar';
import type { LibraryFilters } from '@/ui/components/filter-bar';
import { LibraryGrid } from '@/ui/components/library-grid';
import { PressableScale } from '@/ui/components/pressable-scale';
import { minTouchTarget, space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

/** Newest release counts from this year: a game due next year isn't "newest" yet. */
const endOfThisYear = (): string => `${String(new Date().getFullYear())}-12-31`;

const LibraryScreen = () => {
  const { colors } = useTheme();
  const [filters, setFilters] = useState<LibraryFilters>({ sort: 'released' });

  return (
    <SafeAreaView edges={['top']} style={styles.page}>
      <View style={styles.head}>
        <Text style={[type.largeTitle, { color: colors.text }]} accessibilityRole="header">
          Library
        </Text>
        <View style={styles.actions}>
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

      <FilterBar filters={filters} onChange={setFilters} />

      <LibraryGrid
        // All leaves out Playing: those games are on the shelf above.
        filters={{
          ...filters,
          ...(filters.status === undefined ? { excludeStatus: 'playing' } : {}),
          releasedBy: endOfThisYear(),
        }}
        empty={
          <View style={styles.empty}>
            <Text style={[type.body, { color: colors.muted }]}>
              {isFiltered(filters)
                ? 'No games match these filters.'
                : 'Your library is empty. Find a game in Search and add it.'}
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
