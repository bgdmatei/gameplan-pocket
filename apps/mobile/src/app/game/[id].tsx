import { DomainValidationError, ENTRY_STATUSES } from '@gameplan/domain';
import type { EntryStatus } from '@gameplan/domain';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useDatabase } from '@/data/database';
import { syncEnv, today } from '@/data/env';
import { EntryEditor } from '@/features/entry/entry-editor';
import { addGame } from '@/features/library/add-game';
import { useGameDetail } from '@/features/library/use-game-detail';
import { Cover } from '@/ui/components/cover';
import { PrimaryButton } from '@/ui/components/primary-button';
import { StatusChips } from '@/ui/components/status-chips';
import { useToast } from '@/ui/components/toast';
import { STATUS_LABEL, releaseYear } from '@/ui/labels';
import { radius, space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

const UNAVAILABLE = {
  offline: 'You’re offline, and this game isn’t on this phone yet.',
  not_found: 'This game isn’t in the catalog.',
  failed: 'The catalog couldn’t be reached. Try again in a moment.',
} as const;

const GameScreen = () => {
  const { colors, status: statusColors } = useTheme();
  const adapter = useDatabase();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useGameDetail(Number(id));
  const [startAs, setStartAs] = useState<EntryStatus>('backlog');
  const [saving, setSaving] = useState(false);

  if (detail.kind === 'loading') {
    return (
      <View style={styles.centred}>
        <ActivityIndicator color={colors.accent} accessibilityLabel="Loading the game" />
      </View>
    );
  }
  if (detail.kind === 'unavailable') {
    return (
      <View style={styles.centred}>
        <Text style={[type.body, { color: colors.muted }]}>{UNAVAILABLE[detail.reason]}</Text>
      </View>
    );
  }

  const { game, entry, genres, platforms, cached } = detail;
  const genreNames = genres.filter((genre) => game.genreIds.includes(genre.id)).map((g) => g.name);
  const gamePlatforms = platforms.filter((platform) => game.platformIds.includes(platform.id));
  const platformNames = gamePlatforms.map((platform) => platform.abbreviation ?? platform.name);

  const add = async (): Promise<void> => {
    setSaving(true);
    try {
      const result = await addGame(adapter, syncEnv, {
        gameId: game.id,
        status: startAs,
        today: today(),
      });
      toast.show(result === 'restored' ? 'Back in your library.' : 'Added to your library.');
    } catch (error) {
      if (error instanceof DomainValidationError) toast.showRejected(error);
      else toast.show('The game couldn’t be added. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.top}>
        <Cover imageId={game.coverImageId} gameId={game.id} size="cover_big" width={120} />
        <View style={styles.heading}>
          <Text style={[type.title, { color: colors.text }]} accessibilityRole="header">
            {game.name}
          </Text>
          {game.firstReleaseDate === null ? null : (
            <Text style={[type.subhead, { color: colors.muted }]}>
              {releaseYear(game.firstReleaseDate)}
            </Text>
          )}
          {platformNames.length === 0 ? null : (
            <Text style={[type.subhead, { color: colors.muted }]}>{platformNames.join(' · ')}</Text>
          )}
        </View>
      </View>

      {genreNames.length === 0 ? null : (
        <Text style={[type.subhead, { color: colors.text }]}>{genreNames.join(', ')}</Text>
      )}

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        {entry === null ? (
          cached ? (
            <>
              <Text style={[type.label, { color: colors.muted }]}>ADD TO YOUR LIBRARY AS</Text>
              <StatusChips
                options={ENTRY_STATUSES}
                selected={startAs}
                onSelect={setStartAs}
                disabled={saving}
              />
              <PrimaryButton label="Add to library" onPress={() => void add()} busy={saving} />
            </>
          ) : (
            <Text style={[type.body, { color: colors.muted }]}>
              This game can be added once the catalog is reachable.
            </Text>
          )
        ) : entry.archived ? (
          <>
            <Text style={[type.body, { color: colors.text }]}>
              In your archive, with its rating and notes.
            </Text>
            <PrimaryButton label="Restore to library" onPress={() => void add()} busy={saving} />
          </>
        ) : (
          <>
            <View style={styles.inLibrary}>
              <View style={[styles.dot, { backgroundColor: statusColors[entry.status] }]} />
              <Text style={[type.headline, { color: statusColors[entry.status] }]}>
                In your library · {STATUS_LABEL[entry.status]}
              </Text>
            </View>
            <EntryEditor entry={entry} platforms={gamePlatforms} />
          </>
        )}
      </View>

      {game.summary === null ? null : (
        <Text style={[type.body, { color: colors.text }]}>{game.summary}</Text>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  top: { flexDirection: 'row', gap: space.lg },
  heading: { flex: 1, gap: space.xs },
  card: { borderWidth: 1, borderRadius: radius.card, padding: space.lg, gap: space.md },
  inLibrary: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
});

export default GameScreen;
