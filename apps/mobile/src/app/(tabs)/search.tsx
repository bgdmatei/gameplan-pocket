import { CATALOG_LIMITS } from '@gameplan/contracts';
import {
  CATALOG_TABLES,
  LIBRARY_ENTRY_TABLES,
  listLibraryGrid,
  searchGames,
} from '@gameplan/storage';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@/data/use-query';
import { mergeSearch } from '@/features/search/merge';
import type { SearchNotice } from '@/features/search/merge';
import { useRemoteSearch } from '@/features/search/use-remote-search';
import { GameRow } from '@/ui/components/game-row';
import type { GameRowProps } from '@/ui/components/game-row';
import { releaseYear } from '@/ui/labels';
import { minTouchTarget, radius, space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

type Row = Omit<GameRowProps, 'onPress'>;

const NOTICE: Record<Exclude<SearchNotice, null>, string> = {
  offline: 'Offline: showing games on this phone only.',
  incomplete: 'The catalog could not be reached fully, so results may be incomplete.',
};

const SearchScreen = () => {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const query = text.trim().replace(/\s+/g, ' ');
  const searching = query.length >= CATALOG_LIMITS.queryMinLength;

  // Local search runs on every keystroke, with no debounce (plan §12.1: < 50 ms).
  const local = useQuery(
    (db) => (searching ? searchGames(db, query, { limit: 30 }) : Promise.resolve([])),
    CATALOG_TABLES,
    [query],
  );
  const recent = useQuery(
    (db) => listLibraryGrid(db, { sort: 'recent', limit: 20 }),
    LIBRARY_ENTRY_TABLES,
    [],
  );
  const remote = useRemoteSearch(searching ? query : null);

  const merged = mergeSearch(local.status === 'ready' ? local.data : [], remote);
  const rows: Row[] = searching
    ? merged.rows.map(({ game, entry }) => ({
        gameId: game.id,
        name: game.name,
        coverImageId: game.coverImageId,
        releaseYear: releaseYear(game.firstReleaseDate),
        status: entry?.status ?? null,
      }))
    : recent.status === 'ready'
      ? recent.data.rows.map((row) => ({
          gameId: row.gameId,
          name: row.name,
          coverImageId: row.coverImageId,
          releaseYear: null,
          status: row.status,
        }))
      : [];

  const open = useCallback((gameId: number) => {
    router.push({ pathname: '/game/[id]', params: { id: String(gameId) } });
  }, []);

  const empty = searching
    ? remote.kind === 'waiting'
      ? 'Searching the catalog…'
      : `No games match “${query}”.`
    : 'Games you add show up here. Search by name to find one.';

  return (
    <SafeAreaView edges={['top']} style={styles.page}>
      <View style={styles.head}>
        <Text style={[type.largeTitle, { color: colors.text }]} accessibilityRole="header">
          Search
        </Text>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Game name"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Search games"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          returnKeyType="search"
          maxLength={CATALOG_LIMITS.queryMaxLength}
          style={[
            type.body,
            styles.input,
            { color: colors.text, backgroundColor: colors.surface, borderColor: colors.line },
          ]}
        />
        {searching && merged.notice !== null ? (
          <Text style={[type.subhead, { color: colors.muted }]} accessibilityLiveRegion="polite">
            {NOTICE[merged.notice]}
          </Text>
        ) : null}
        {!searching && rows.length > 0 ? (
          <Text style={[type.label, { color: colors.muted }]}>RECENTLY UPDATED</Text>
        ) : null}
      </View>

      <FlatList
        data={rows}
        keyExtractor={(row) => String(row.gameId)}
        renderItem={({ item }) => <GameRow {...item} onPress={open} />}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          <Text style={[type.body, styles.empty, { color: colors.muted }]}>{empty}</Text>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1 },
  head: { paddingHorizontal: space.lg, paddingBottom: space.sm, gap: space.md },
  input: {
    minHeight: minTouchTarget,
    paddingHorizontal: space.md,
    borderRadius: radius.small,
    borderWidth: 1,
  },
  empty: { paddingHorizontal: space.lg, paddingTop: space.lg },
});

export default SearchScreen;
