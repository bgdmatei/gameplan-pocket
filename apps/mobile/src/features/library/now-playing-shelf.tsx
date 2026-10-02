import Ionicons from '@expo/vector-icons/Ionicons';
import { DomainValidationError } from '@gameplan/domain';
import { LIBRARY_ENTRY_TABLES, SHELF_SIZE, listNowPlaying } from '@gameplan/storage';
import type { ShelfGame } from '@gameplan/storage';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useDatabase } from '@/data/database';
import { syncEnv, today } from '@/data/env';
import { useQuery } from '@/data/use-query';
import { Cover } from '@/ui/components/cover';
import { GameRow } from '@/ui/components/game-row';
import { PressableScale } from '@/ui/components/pressable-scale';
import { Sheet } from '@/ui/components/sheet';
import { useToast } from '@/ui/components/toast';
import { STATUS_LABEL } from '@/ui/labels';
import { radius, space, tabularNumbers, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';
import { SHELF_STATUSES, setStatusFromShelf } from './now-playing';

const openGame = (gameId: number) =>
  router.push({ pathname: '/game/[id]', params: { id: String(gameId) } });

/**
 * Every game set to Playing, at the top of the library: five slots for the
 * most recently started, and See all for the rest. Tap a cover to open the
 * game, hold it to move it on (Paused, Completed, Dropped), tap an empty slot
 * to find a game in Search.
 */
export const NowPlayingShelf = () => {
  const { colors } = useTheme();
  const adapter = useDatabase();
  const toast = useToast();
  const [showingAll, setShowingAll] = useState(false);
  const playing = useQuery(listNowPlaying, LIBRARY_ENTRY_TABLES, []);
  const games = playing.status === 'ready' ? playing.data : [];

  const moveOn = (game: ShelfGame) =>
    Alert.alert(game.name, 'Move it off Now Playing:', [
      ...SHELF_STATUSES.map((status) => ({
        text: STATUS_LABEL[status],
        onPress: () => {
          setStatusFromShelf(adapter, syncEnv, { entryId: game.id, status, today: today() }).then(
            () => toast.show(`${game.name} is ${STATUS_LABEL[status]}.`),
            (error: unknown) => {
              if (error instanceof DomainValidationError) toast.showRejected(error);
              else toast.show('The status couldn’t be changed. Try again.');
            },
          );
        },
      })),
      { text: 'Cancel', style: 'cancel' },
    ]);

  const slots = Array.from({ length: SHELF_SIZE }, (_, index) => games[index] ?? null);

  return (
    <View style={styles.shelf}>
      <View style={styles.heading}>
        <Text style={[type.label, { color: colors.muted }]} accessibilityRole="header">
          NOW PLAYING
        </Text>
        {games.length > SHELF_SIZE ? (
          <PressableScale
            onPress={() => setShowingAll(true)}
            accessibilityRole="button"
            accessibilityLabel={`See all ${String(games.length)} games you're playing`}
            hitSlop={space.sm}
            style={styles.more}
          >
            <Text style={[type.subhead, tabularNumbers, { color: colors.accent }]}>
              {games.length}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.accent} />
          </PressableScale>
        ) : null}
      </View>
      <View style={styles.row}>
        {slots.map((game, index) =>
          game === null ? (
            <PressableScale
              key={`empty-${String(index)}`}
              onPress={() => router.navigate('/search')}
              accessibilityRole="button"
              accessibilityLabel="Find a game to play"
              style={[styles.slot, styles.empty, { borderColor: colors.line }]}
            >
              <Ionicons name="add" size={22} color={colors.muted} />
            </PressableScale>
          ) : (
            <PressableScale
              key={game.id}
              onPress={() => openGame(game.gameId)}
              onLongPress={() => moveOn(game)}
              accessibilityRole="button"
              accessibilityLabel={game.name}
              accessibilityHint="Opens the game. Hold to pause, complete or drop it"
              style={styles.slot}
            >
              <Cover
                imageId={game.coverImageId}
                gameId={game.gameId}
                size="cover_small"
                width="100%"
              />
            </PressableScale>
          ),
        )}
      </View>

      <Sheet visible={showingAll} title="Now playing" onClose={() => setShowingAll(false)}>
        <View style={styles.list}>
          {games.map((game) => (
            <GameRow
              key={game.id}
              gameId={game.gameId}
              name={game.name}
              coverImageId={game.coverImageId}
              releaseYear={null}
              platforms={null}
              onPress={(gameId) => {
                setShowingAll(false);
                openGame(gameId);
              }}
            />
          ))}
        </View>
      </Sheet>
    </View>
  );
};

const styles = StyleSheet.create({
  // The bottom gap sets the shelf apart from the filter chips below it.
  shelf: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.lg,
    gap: space.sm,
  },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  more: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  row: { flexDirection: 'row', gap: space.sm },
  slot: { flex: 1 },
  empty: {
    aspectRatio: 3 / 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radius.cover,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { marginHorizontal: -space.lg },
});
