import Ionicons from '@expo/vector-icons/Ionicons';
import { ENTRY_TAG_TABLES, LIBRARY_ENTRY_TABLES, listTagsInUse } from '@gameplan/storage';
import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@/data/use-query';
import { FilterBar } from '@/ui/components/filter-bar';
import type { LibraryFilters } from '@/ui/components/filter-bar';
import { LibraryGrid } from '@/ui/components/library-grid';
import { PressableScale } from '@/ui/components/pressable-scale';
import { minTouchTarget, space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

const LibraryScreen = () => {
  const { colors } = useTheme();
  const [filters, setFilters] = useState<LibraryFilters>({ sort: 'recent' });
  const tags = useQuery(
    async (db) => (await listTagsInUse(db)).map((row) => row.tag),
    [...ENTRY_TAG_TABLES, ...LIBRARY_ENTRY_TABLES],
    [],
  );
  const filtered =
    filters.status !== undefined || filters.favourite !== undefined || filters.tag !== undefined;

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

      <FilterBar
        filters={filters}
        tags={tags.status === 'ready' ? tags.data : []}
        onChange={setFilters}
      />

      <LibraryGrid
        filters={filters}
        empty={
          <View style={styles.empty}>
            <Text style={[type.body, { color: colors.muted }]}>
              {filtered
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
