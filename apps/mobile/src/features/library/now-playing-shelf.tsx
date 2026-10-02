import Ionicons from '@expo/vector-icons/Ionicons';
import { DomainValidationError } from '@gameplan/domain';
import { LIBRARY_ENTRY_TABLES, SHELF_SIZE, listLibraryGrid, listShelf } from '@gameplan/storage';
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
import { radius, space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';
import { shelveGame, unshelveGame } from './shelf';

/** Enough for anyone's games in progress; the picker is a list, not a grid. */
const PICKER_LIMIT = 200;

/**
 * Five slots at the top of the library for the games being played right now.
 * Tap a cover to open the game, hold it to take it off the shelf, tap an
 * empty slot to pick from the games set to Playing.
 */
export const NowPlayingShelf = () => {
  const { colors } = useTheme();
  const adapter = useDatabase();
  const toast = useToast();
  const [picking, setPicking] = useState(false);
  const shelf = useQuery(listShelf, LIBRARY_ENTRY_TABLES, []);
  const games = shelf.status === 'ready' ? shelf.data : [];

  const remove = (game: ShelfGame) =>
    Alert.alert(`Take ${game.name} off the shelf?`, 'It stays in your library as Playing.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Take off',
        style: 'destructive',
        onPress: () => {
          unshelveGame(adapter, syncEnv, { entryId: game.id, today: today() }).catch(() =>
            toast.show('The shelf couldn’t be changed. Try again.'),
          );
        },
      },
    ]);

  const add = async (entryId: string): Promise<void> => {
    setPicking(false);
    try {
      await shelveGame(adapter, syncEnv, { entryId, today: today() });
    } catch (error) {
      if (error instanceof DomainValidationError) toast.showRejected(error);
      else toast.show('The shelf couldn’t be changed. Try again.');
    }
  };

  const slots = Array.from({ length: SHELF_SIZE }, (_, index) => games[index] ?? null);

  return (
    <View style={styles.shelf}>
      <Text style={[type.label, { color: colors.muted }]} accessibilityRole="header">
        NOW PLAYING
      </Text>
      <View style={styles.row}>
        {slots.map((game, index) =>
          game === null ? (
            <PressableScale
              key={`empty-${String(index)}`}
              onPress={() => setPicking(true)}
              accessibilityRole="button"
              accessibilityLabel="Add a game you're playing"
              style={[styles.slot, styles.empty, { borderColor: colors.line }]}
            >
              <Ionicons name="add" size={22} color={colors.muted} />
            </PressableScale>
          ) : (
            <PressableScale
              key={game.id}
              onPress={() =>
                router.push({ pathname: '/game/[id]', params: { id: String(game.gameId) } })
              }
              onLongPress={() => remove(game)}
              accessibilityRole="button"
              accessibilityLabel={game.name}
              accessibilityHint="Opens the game. Hold to take it off the shelf"
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

      <Sheet visible={picking} title="Now playing" onClose={() => setPicking(false)}>
        <PlayingPicker shelved={games} onPick={(entryId) => void add(entryId)} />
      </Sheet>
    </View>
  );
};

/** Games set to Playing that aren't on the shelf yet. */
const PlayingPicker = ({
  shelved,
  onPick,
}: {
  shelved: readonly ShelfGame[];
  onPick: (entryId: string) => void;
}) => {
  const { colors } = useTheme();
  const playing = useQuery(
    (db) => listLibraryGrid(db, { status: 'playing', sort: 'name', limit: PICKER_LIMIT }),
    LIBRARY_ENTRY_TABLES,
    [],
  );
  if (playing.status !== 'ready') return null;
  // Filtered by what the shelf shows rather than by `shelved = 0`, so the list
  // offers exactly the games that aren't in a slot.
  const onShelf = new Set(shelved.map((game) => game.id));
  const rows = playing.data.rows.filter((row) => !onShelf.has(row.id));

  if (rows.length === 0) {
    return (
      <Text style={[type.body, { color: colors.muted }]}>
        Nothing else is set to Playing. Change a game’s status to Playing to put it here.
      </Text>
    );
  }
  return (
    <View style={styles.picker}>
      {rows.map((row) => (
        <GameRow
          key={row.id}
          gameId={row.gameId}
          name={row.name}
          coverImageId={row.coverImageId}
          releaseYear={null}
          platforms={null}
          onPress={() => onPick(row.id)}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  shelf: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm },
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
  picker: { marginHorizontal: -space.lg },
});
