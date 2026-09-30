import { DomainValidationError, ENTRY_STATUSES } from '@gameplan/domain';
import type { EntryStatus } from '@gameplan/domain';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '@/data/database';
import { syncEnv, today } from '@/data/env';
import { EntryEditor } from '@/features/entry/entry-editor';
import { addGame } from '@/features/library/add-game';
import { NotesLink } from '@/features/notes/notes-link';
import { useGameDetail } from '@/features/library/use-game-detail';
import { Cover } from '@/ui/components/cover';
import { LoadFailed } from '@/ui/components/load-failed';
import { PrimaryButton } from '@/ui/components/primary-button';
import { SkeletonBlock } from '@/ui/components/skeleton';
import { StatusChips } from '@/ui/components/status-chips';
import { useToast } from '@/ui/components/toast';
import { releaseYear } from '@/ui/labels';
import { radius, space, tabularNumbers, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

const UNAVAILABLE = {
  offline: 'You’re offline, and this game isn’t on this phone yet.',
  not_found: 'This game isn’t in the catalog.',
  failed: 'The catalog couldn’t be reached. Try again in a moment.',
} as const;

/** Cover width on this screen; at 3:4 the heading has scrolled away once past its height. */
const COVER_WIDTH = 120;
const TITLE_GONE_AT = (COVER_WIDTH * 4) / 3;

const GameScreen = () => {
  const { colors } = useTheme();
  const adapter = useDatabase();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useGameDetail(Number(id));
  const [startAs, setStartAs] = useState<EntryStatus>('backlog');
  const [saving, setSaving] = useState(false);
  // Only flips at the threshold, so scrolling doesn't re-render per frame.
  const [titleInHeader, setTitleInHeader] = useState(false);

  if (detail.kind === 'loading') {
    return (
      <View
        style={styles.page}
        accessible
        accessibilityLabel="Loading the game"
        accessibilityState={{ busy: true }}
      >
        <View style={styles.top}>
          <SkeletonBlock width={120} aspectRatio={3 / 4} round={radius.cover} />
          <View style={styles.heading}>
            <SkeletonBlock width="80%" height={22} />
            <SkeletonBlock width="30%" height={14} />
          </View>
        </View>
        <SkeletonBlock width="100%" height={180} round={radius.card} />
      </View>
    );
  }
  if (detail.kind === 'failed') {
    return <LoadFailed message="This game couldn’t be read." onRetry={detail.retry} />;
  }
  if (detail.kind === 'unavailable') {
    // Asking again can't help a game the catalog doesn't have.
    return detail.reason === 'not_found' ? (
      <View style={styles.page}>
        <Text style={[type.body, { color: colors.muted }]}>{UNAVAILABLE.not_found}</Text>
      </View>
    ) : (
      <LoadFailed message={UNAVAILABLE[detail.reason]} onRetry={detail.retry} />
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
      contentContainerStyle={[styles.page, { paddingBottom: space.xl + insets.bottom }]}
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={100}
      onScroll={(event) => {
        const gone = event.nativeEvent.contentOffset.y > TITLE_GONE_AT;
        if (gone !== titleInHeader) setTitleInHeader(gone);
      }}
    >
      <Stack.Screen options={{ title: titleInHeader ? game.name : '' }} />
      <View style={styles.top}>
        <Cover imageId={game.coverImageId} gameId={game.id} size="cover_big" width={COVER_WIDTH} />
        <View style={styles.heading}>
          <Text style={[type.title, { color: colors.text }]} accessibilityRole="header">
            {game.name}
          </Text>
          {game.firstReleaseDate === null ? null : (
            <Text style={[type.subhead, tabularNumbers, { color: colors.muted }]}>
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

      {entry === null || entry.archived ? null : (
        <>
          <NotesLink gameId={game.id} entryId={entry.id} />
          <EntryEditor entry={entry} platforms={gamePlatforms} />
        </>
      )}

      {entry !== null && !entry.archived ? null : (
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
          ) : (
            <>
              <Text style={[type.body, { color: colors.text }]}>
                In your archive, with its rating and notes.
              </Text>
              <PrimaryButton label="Restore to library" onPress={() => void add()} busy={saving} />
            </>
          )}
        </View>
      )}

      {game.summary === null ? null : (
        <Text style={[type.body, { color: colors.text }]}>{game.summary}</Text>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  top: { flexDirection: 'row', gap: space.lg },
  heading: { flex: 1, gap: space.xs },
  card: { borderWidth: 1, borderRadius: radius.card, padding: space.lg, gap: space.md },
});

export default GameScreen;
