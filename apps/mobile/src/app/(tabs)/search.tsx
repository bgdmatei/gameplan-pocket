import { CATALOG_LIMITS } from '@gameplan/contracts';
import type { Platform } from '@gameplan/domain';
import {
  CATALOG_TABLES,
  LIBRARY_ENTRY_TABLES,
  getGamesByIds,
  getReference,
  listLibraryGrid,
  searchGames,
} from '@gameplan/storage';
import { router, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { startTimer } from '@/data/perf';
import { useQuery } from '@/data/use-query';
import { mergeSearch } from '@/features/search/merge';
import type { SearchNotice } from '@/features/search/merge';
import { useRemoteSearch } from '@/features/search/use-remote-search';
import { GameRow } from '@/ui/components/game-row';
import { LoadFailed } from '@/ui/components/load-failed';
import type { GameRowProps } from '@/ui/components/game-row';
import { releaseYear } from '@/ui/labels';
import { platformLabel, playablePlatforms } from '@/ui/platforms';
import { minTouchTarget, radius, space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

type Row = Omit<GameRowProps, 'onPress'>;

/**
 * The platforms a game can be played on, as the row shows them, in the app's
 * usual order. An id this phone has no name for (a remote result naming a
 * platform IGDB added since) is left out rather than shown as a number.
 */
const platformLine = (ids: readonly number[], known: readonly Platform[]): string | null => {
  const names = playablePlatforms(ids, known).map(platformLabel);
  return names.length === 0 ? null : names.join(' · ');
};

const NOTICE: Record<Exclude<SearchNotice, null>, string> = {
  offline: 'Offline: showing games on this phone only.',
  incomplete: 'The catalog could not be reached fully, so results may be incomplete.',
};

const SearchScreen = () => {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const [text, setText] = useState('');

  // Leaving for another tab starts the next visit empty. Opening a game from
  // the results also blurs this screen, but the tab stays selected: back
  // returns to the same results.
  useEffect(
    () =>
      navigation.addListener('blur', () => {
        const tabs = navigation.getState();
        if (tabs !== undefined && tabs.routes[tabs.index]?.name !== 'search') setText('');
      }),
    [navigation],
  );
  const query = text.trim().replace(/\s+/g, ' ');
  const searching = query.length >= CATALOG_LIMITS.queryMinLength;

  // Local search runs on every keystroke, with no debounce (plan §12.1: < 50 ms).
  const local = useQuery(
    (db) => (searching ? searchGames(db, query, { limit: 30 }) : Promise.resolve([])),
    CATALOG_TABLES,
    [query],
  );
  // Times a keystroke until its local results are on screen (T19).
  const searchTimer = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (local.status !== 'ready') return;
    searchTimer.current?.();
    searchTimer.current = null;
  }, [local]);
  const changeText = (next: string) => {
    searchTimer.current = startTimer('search');
    setText(next);
  };

  const recent = useQuery(
    async (db) => {
      const page = await listLibraryGrid(db, { sort: 'recent', limit: 20 });
      // The grid's slim rows carry no platforms; these few come from the games.
      const games = await getGamesByIds(db, [...new Set(page.rows.map((row) => row.gameId))]);
      const platformIds = new Map(games.map((game) => [game.id, game.platformIds]));
      return page.rows.map((row) => ({ ...row, platformIds: platformIds.get(row.gameId) ?? [] }));
    },
    LIBRARY_ENTRY_TABLES,
    [],
  );
  const reference = useQuery(getReference, CATALOG_TABLES, []);
  const known = reference.status === 'ready' ? reference.data.platforms : [];
  const remote = useRemoteSearch(searching ? query : null);

  const merged = mergeSearch(local.status === 'ready' ? local.data : [], remote);
  const rows: Row[] = searching
    ? merged.rows.map(({ game }) => ({
        gameId: game.id,
        name: game.name,
        coverImageId: game.coverImageId,
        releaseYear: releaseYear(game.firstReleaseDate),
        platforms: platformLine(game.platformIds, known),
      }))
    : recent.status === 'ready'
      ? recent.data.map((row) => ({
          gameId: row.gameId,
          name: row.name,
          coverImageId: row.coverImageId,
          releaseYear: null,
          platforms: platformLine(row.platformIds, known),
        }))
      : [];

  const open = useCallback((gameId: number) => {
    router.push({ pathname: '/game/[id]', params: { id: String(gameId) } });
  }, []);

  // Remote results can still arrive; only a failed local read is shown as a failure.
  const failed = searching
    ? local.status === 'failed'
      ? local
      : null
    : recent.status === 'failed'
      ? recent
      : null;

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
          onChangeText={changeText}
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
          failed === null ? (
            <Text style={[type.body, styles.empty, { color: colors.muted }]}>{empty}</Text>
          ) : (
            <LoadFailed message="Games on this phone couldn’t be read." onRetry={failed.retry} />
          )
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
