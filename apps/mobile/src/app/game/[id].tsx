import { DomainValidationError, ENTRY_STATUSES } from '@gameplan/domain';
import type { EntryStatus } from '@gameplan/domain';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '@/data/database';
import { syncEnv, today } from '@/data/env';
import { EntryEditor } from '@/features/entry/entry-editor';
import { addGame } from '@/features/library/add-game';
import { NotesLink } from '@/features/notes/notes-link';
import { useGameDetail } from '@/features/library/use-game-detail';
import { Chip } from '@/ui/components/chip';
import { Frosted } from '@/ui/components/frosted';
import { Hero, backdropHeroHeight } from '@/ui/components/hero';
import { LoadFailed } from '@/ui/components/load-failed';
import { PrimaryButton } from '@/ui/components/primary-button';
import { SkeletonBlock } from '@/ui/components/skeleton';
import { StatusChips } from '@/ui/components/status-chips';
import { useToast } from '@/ui/components/toast';
import { releaseDate } from '@/ui/labels';
import { platformLabel, playablePlatforms } from '@/ui/platforms';
import { displayMaxScale, minTouchTarget, radius, space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

const UNAVAILABLE = {
  offline: 'You’re offline, and this game isn’t on this phone yet.',
  not_found: 'This game isn’t in the catalog.',
  failed: 'The catalog couldn’t be reached. Try again in a moment.',
} as const;

/** iOS's navigation bar, below the status bar: the header floats over the hero. */
const NAV_BAR = 44;
/** Room the bottom bar takes over the end of the page, above the home indicator. */
const BAR_ROOM = minTouchTarget + 4 + 2 * space.sm;

const GameScreen = () => {
  const { colors, scheme } = useTheme();
  const adapter = useDatabase();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const heroHeight = backdropHeroHeight(width, insets.top + NAV_BAR);
  // Once the hero has scrolled out from under the status bar, the bar takes the
  // theme's ink. The header stays clear throughout, buttons only (owner, #32):
  // the layout's headerTransparent and empty title, never a bar with the name.
  const heroGoneAt = heroHeight - insets.top;
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useGameDetail(Number(id));
  const [startAs, setStartAs] = useState<EntryStatus>('backlog');
  const [platformId, setPlatformId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  // Only flips at the threshold, so scrolling doesn't re-render per frame.
  const [pastHero, setPastHero] = useState(false);

  if (detail.kind === 'loading') {
    return (
      <View
        style={styles.page}
        accessible
        accessibilityLabel="Loading the game"
        accessibilityState={{ busy: true }}
      >
        <SkeletonBlock width="100%" height={heroHeight} round={0} />
        <View style={styles.body}>
          <View style={styles.heading}>
            <SkeletonBlock width="70%" height={34} />
            <SkeletonBlock width="30%" height={14} />
          </View>
          <SkeletonBlock width="100%" height={180} round={radius.card} />
        </View>
      </View>
    );
  }
  // The header is transparent on this screen (it floats over the hero), so
  // the states without one start below it.
  const belowHeader = { paddingTop: insets.top + NAV_BAR };
  if (detail.kind === 'failed') {
    return (
      <View style={[styles.page, belowHeader]}>
        <LoadFailed message="This game couldn’t be read." onRetry={detail.retry} />
      </View>
    );
  }
  if (detail.kind === 'unavailable') {
    // Asking again can't help a game the catalog doesn't have.
    return (
      <View style={[styles.page, belowHeader]}>
        {detail.reason === 'not_found' ? (
          <Text style={[type.body, styles.body, { color: colors.muted }]}>
            {UNAVAILABLE.not_found}
          </Text>
        ) : (
          <LoadFailed message={UNAVAILABLE[detail.reason]} onRetry={detail.retry} />
        )}
      </View>
    );
  }

  const { game, entry, genres, platforms, cached } = detail;
  const genreNames = genres.filter((genre) => game.genreIds.includes(genre.id)).map((g) => g.name);
  const gamePlatforms = playablePlatforms(game.platformIds, platforms);
  // Everything known about the game, for its About card (owner, #32).
  const facts = [
    { label: 'Released', value: releaseDate(game.firstReleaseDate) },
    { label: 'Developer', value: game.developer },
    { label: 'Genres', value: genreNames.length === 0 ? null : genreNames.join(', ') },
    {
      label: 'Platforms',
      value:
        gamePlatforms.length === 0
          ? null
          : gamePlatforms.map((platform) => platform.name).join(', '),
    },
  ].filter((fact): fact is { label: string; value: string } => fact.value !== null);

  const add = async (): Promise<void> => {
    setSaving(true);
    try {
      const result = await addGame(adapter, syncEnv, {
        gameId: game.id,
        status: startAs,
        platformId,
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

  const inLibrary = entry !== null && !entry.archived;

  return (
    <View style={styles.page}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: space.xl + insets.bottom + (inLibrary ? BAR_ROOM : 0),
        }}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={100}
        onScroll={(event) => {
          const gone = event.nativeEvent.contentOffset.y > heroGoneAt;
          if (gone !== pastHero) setPastHero(gone);
        }}
      >
        {/* Light over the cover art, in either theme; the theme's own once past it. */}
        <StatusBar style={pastHero && scheme === 'light' ? 'dark' : 'light'} />
        <Hero
          imageId={game.coverImageId}
          gameId={game.id}
          height={heroHeight}
          variant="backdrop"
          topInset={insets.top + NAV_BAR}
          width={width}
        />
        <View style={styles.body}>
          <View style={styles.heading}>
            <Text
              maxFontSizeMultiplier={displayMaxScale}
              style={[type.display, styles.centred, { color: colors.text }]}
              accessibilityRole="header"
            >
              {game.name}
            </Text>
          </View>

          {inLibrary ? <EntryEditor entry={entry} platforms={gamePlatforms} /> : null}

          {inLibrary ? null : (
            <View
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}
            >
              {entry === null ? (
                cached ? (
                  <>
                    {gamePlatforms.length === 0 ? null : (
                      <>
                        <Text style={[type.label, { color: colors.muted }]}>YOU PLAY IT ON</Text>
                        <View style={styles.wrap}>
                          {gamePlatforms.map((platform) => (
                            <Chip
                              key={platform.id}
                              label={platformLabel(platform)}
                              accessibilityLabel={platform.name}
                              selected={platformId === platform.id}
                              onPress={() => setPlatformId(platform.id)}
                            />
                          ))}
                        </View>
                      </>
                    )}
                    <Text style={[type.label, { color: colors.muted }]}>
                      ADD TO YOUR LIBRARY AS
                    </Text>
                    <StatusChips
                      options={ENTRY_STATUSES}
                      selected={startAs}
                      onSelect={setStartAs}
                      disabled={saving}
                    />
                    <PrimaryButton
                      label={
                        gamePlatforms.length > 0 && platformId === null
                          ? 'Pick a platform to add'
                          : 'Add to library'
                      }
                      onPress={() => void add()}
                      busy={saving}
                      disabled={gamePlatforms.length > 0 && platformId === null}
                    />
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
                  <PrimaryButton
                    label="Restore to library"
                    onPress={() => void add()}
                    busy={saving}
                  />
                </>
              )}
            </View>
          )}

          {/* In a card like the page's other sections, not loose at the foot (#32). */}
          {game.summary === null && facts.length === 0 ? null : (
            <View
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}
            >
              <Text style={[type.label, { color: colors.muted }]}>ABOUT</Text>
              {game.summary === null ? null : (
                <Text style={[type.body, { color: colors.text }]}>{game.summary}</Text>
              )}
              {facts.map((fact) => (
                <View key={fact.label} style={styles.fact}>
                  <Text style={[type.subhead, styles.factLabel, { color: colors.muted }]}>
                    {fact.label}
                  </Text>
                  <Text style={[type.subhead, styles.factValue, { color: colors.text }]}>
                    {fact.value}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
      {inLibrary ? (
        <Frosted
          style={[
            styles.bar,
            { paddingBottom: insets.bottom + space.sm, borderTopColor: colors.line },
          ]}
        >
          <NotesLink gameId={game.id} entryId={entry.id} />
        </Frosted>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1 },
  // The hero fades into the ground; the name sits right below it.
  body: { paddingHorizontal: space.lg, gap: space.lg },
  heading: { alignItems: 'center', gap: space.xs },
  centred: { textAlign: 'center' },
  // Docked at the foot of the screen, the page scrolling under it.
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space.sm,
    paddingHorizontal: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  card: { borderWidth: 1, borderRadius: radius.card, padding: space.lg, gap: space.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  fact: { flexDirection: 'row', gap: space.md },
  // A minimum, not a width: larger text sizes widen it rather than break words.
  factLabel: { minWidth: 80 },
  factValue: { flex: 1 },
});

export default GameScreen;
