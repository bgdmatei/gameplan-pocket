import Ionicons from '@expo/vector-icons/Ionicons';
import { DomainValidationError } from '@gameplan/domain';
import {
  CATALOG_TABLES,
  LIBRARY_ENTRY_TABLES,
  SHELF_SIZE,
  getReference,
  listNowPlaying,
} from '@gameplan/storage';
import type { ShelfGame } from '@gameplan/storage';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useDatabase } from '@/data/database';
import { syncEnv, today } from '@/data/env';
import { useQuery } from '@/data/use-query';
import { GameRow } from '@/ui/components/game-row';
import { ImageCard } from '@/ui/components/image-card';
import { PressableScale } from '@/ui/components/pressable-scale';
import { Sheet } from '@/ui/components/sheet';
import { useToast } from '@/ui/components/toast';
import { STATUS_LABEL, timeSince } from '@/ui/labels';
import { platformById, platformLabel } from '@/ui/platforms';
import { radius, space, tabularNumbers, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';
import { SHELF_STATUSES, setStatusFromShelf } from './now-playing';

/** Cards that fit across the screen; the next one peeks in by `PEEK` of a card, so the row reads as scrollable. */
const VISIBLE = 2;
const PEEK = 0.35;

const openGame = (gameId: number) =>
  router.push({ pathname: '/game/[id]', params: { id: String(gameId) } });

/**
 * Every game set to Playing, at the top of the library: a sideways row of
 * image cards for the five most recently started, and See all for the rest.
 * Tap a card to open the game, hold it to move it on (Paused, Completed,
 * Dropped); the last card, while the row has room, finds a game in Search.
 */
export const NowPlayingShelf = () => {
  const { colors } = useTheme();
  const adapter = useDatabase();
  const toast = useToast();
  const [showingAll, setShowingAll] = useState(false);
  const { width } = useWindowDimensions();
  const playing = useQuery(listNowPlaying, LIBRARY_ENTRY_TABLES, []);
  const reference = useQuery(getReference, CATALOG_TABLES, []);
  const games = playing.status === 'ready' ? playing.data : [];
  const known = reference.status === 'ready' ? reference.data.platforms : [];
  // The row's start inset and the gaps come off first; the end is the peek.
  const cardWidth = Math.floor((width - space.lg - VISIBLE * space.md) / (VISIBLE + PEEK));
  const now = Date.now();

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

  const caption = (game: ShelfGame, spoken: boolean): string => {
    const platform = platformById(game.platformId, known);
    const name = platform === null ? null : spoken ? platform.name : platformLabel(platform);
    return [name, timeSince(game.updatedAt, now)].filter(Boolean).join(' · ');
  };

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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        // Snaps card by card, like the references' carousel.
        snapToInterval={cardWidth + space.md}
        decelerationRate="fast"
      >
        {games.slice(0, SHELF_SIZE).map((game) => (
          <ImageCard
            key={game.id}
            imageId={game.coverImageId}
            gameId={game.gameId}
            title={game.name}
            caption={caption(game, false)}
            spokenCaption={caption(game, true)}
            width={cardWidth}
            size="small"
            onPress={() => openGame(game.gameId)}
            onLongPress={() => moveOn(game)}
            accessibilityHint="Opens the game. Hold to pause, complete or drop it"
          />
        ))}
        {games.length < SHELF_SIZE ? (
          <PressableScale
            onPress={() => router.navigate('/search')}
            accessibilityRole="button"
            accessibilityLabel="Find a game to play"
            style={[styles.empty, { width: cardWidth, borderColor: colors.line }]}
          >
            <Ionicons name="add" size={24} color={colors.muted} />
            <Text style={[type.caption, styles.find, { color: colors.muted }]}>
              Find a game to play
            </Text>
          </PressableScale>
        ) : null}
      </ScrollView>

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
  shelf: { paddingTop: space.sm, paddingBottom: space.md, gap: space.sm },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
  },
  more: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  row: { gap: space.md, paddingHorizontal: space.lg },
  empty: {
    aspectRatio: 3 / 4,
    gap: space.sm,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  find: { textAlign: 'center', paddingHorizontal: space.sm },
  list: { marginHorizontal: -space.lg },
});
