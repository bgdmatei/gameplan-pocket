import Ionicons from '@expo/vector-icons/Ionicons';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { startTimer } from '@/data/perf';
import { useQuery } from '@/data/use-query';
import { mergeSearch } from '@/features/search/merge';
import type { SearchNotice } from '@/features/search/merge';
import { useRemoteSearch } from '@/features/search/use-remote-search';
import { EmptyState } from '@/ui/components/empty-state';
import { Frosted } from '@/ui/components/frosted';
import { GameRow } from '@/ui/components/game-row';
import { LoadFailed } from '@/ui/components/load-failed';
import type { GameRowProps } from '@/ui/components/game-row';
import { releaseYear } from '@/ui/labels';
import { platformLabel, playablePlatforms } from '@/ui/platforms';
import { useTabBarSpace } from '@/ui/components/tab-bar';
import { minTouchTarget, radius, space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

type Row = Omit<GameRowProps, 'onPress'>;

/**
 * The platforms a game can be played on, as the row shows them, in the app's
 * usual order. An id this phone has no name for (a remote result naming a
 * platform IGDB added since) is left out rather than shown as a number.
 */
const platformLine = (
  ids: readonly number[],
  known: readonly Platform[],
): { shown: string | null; spoken: string | null } => {
  const platforms = playablePlatforms(ids, known);
  if (platforms.length === 0) return { shown: null, spoken: null };
  return {
    shown: platforms.map(platformLabel).join(' · '),
    spoken: platforms.map((platform) => platform.name).join(', '),
  };
};

const platformFields = ({ shown, spoken }: ReturnType<typeof platformLine>) => ({
  platforms: shown,
  platformsSpoken: spoken,
});

const NOTICE: Record<Exclude<SearchNotice, null>, string> = {
  offline: 'Offline: showing games on this phone only.',
  incomplete: 'The catalog could not be reached fully, so results may be incomplete.',
};

const SearchScreen = () => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace();
  // The frosted bar floats over the list; the list starts below it.
  const [barHeight, setBarHeight] = useState(0);
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
        ...platformFields(platformLine(game.platformIds, known)),
      }))
    : recent.status === 'ready'
      ? recent.data.map((row) => ({
          gameId: row.gameId,
          name: row.name,
          coverImageId: row.coverImageId,
          releaseYear: null,
          ...platformFields(platformLine(row.platformIds, known)),
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

  const empty = !searching
    ? {
        icon: 'search' as const,
        message: 'Games you add show up here. Search by name to find one.',
      }
    : remote.kind === 'waiting'
      ? { icon: 'search' as const, message: 'Searching the catalog…', busy: true }
      : { icon: 'help-circle-outline' as const, message: `No games match “${query}”.` };

  return (
    <View style={styles.page}>
      <FlatList
        data={rows}
        keyExtractor={(row) => String(row.gameId)}
        renderItem={({ item }) => <GameRow {...item} onPress={open} />}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // Rows scroll under the frosted bar; the last one clears the floating tab bar.
        contentContainerStyle={{ paddingTop: barHeight, paddingBottom: space.xl + tabBarSpace }}
        scrollIndicatorInsets={{ top: barHeight }}
        ListHeaderComponent={
          searching && merged.notice !== null ? (
            <View
              style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.line }]}
              accessibilityLiveRegion="polite"
            >
              <Ionicons
                name={merged.notice === 'offline' ? 'cloud-offline-outline' : 'warning-outline'}
                size={18}
                color={colors.muted}
              />
              <Text style={[type.subhead, styles.noticeText, { color: colors.text }]}>
                {NOTICE[merged.notice]}
              </Text>
            </View>
          ) : !searching && rows.length > 0 ? (
            <Text style={[type.label, styles.section, { color: colors.muted }]}>
              RECENTLY UPDATED
            </Text>
          ) : null
        }
        ListEmptyComponent={
          failed === null ? (
            <EmptyState {...empty} />
          ) : (
            <LoadFailed message="Games on this phone couldn’t be read." onRetry={failed.retry} />
          )
        }
      />

      <Frosted style={[styles.bar, { paddingTop: insets.top, borderBottomColor: colors.line }]}>
        <View
          onLayout={(event) =>
            setBarHeight(event.nativeEvent.layout.height + insets.top + space.md)
          }
        >
          <Text
            style={[type.display, styles.title, { color: colors.text }]}
            accessibilityRole="header"
          >
            Search
          </Text>
          <View
            style={[styles.field, { backgroundColor: colors.surface, borderColor: colors.line }]}
          >
            <Ionicons name="search" size={18} color={colors.muted} />
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
              style={[type.body, styles.input, { color: colors.text }]}
            />
          </View>
        </View>
      </Frosted>
    </View>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1 },
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { paddingBottom: space.sm },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: minTouchTarget,
    paddingLeft: space.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  // The clear button sits at the input's end, inside the pill.
  input: { flex: 1, minHeight: minTouchTarget, paddingRight: space.md },
  section: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xs },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginTop: space.md,
    marginBottom: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  noticeText: { flex: 1 },
});

export default SearchScreen;
