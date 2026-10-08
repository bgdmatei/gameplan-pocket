import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { minTouchTarget, space, tabularNumbers, type } from '../theme';
import { useTheme } from '../use-theme';
import { Cover } from './cover';

export type GameRowProps = {
  gameId: number;
  name: string;
  coverImageId: string | null;
  releaseYear: string | null;
  /** The platforms it runs on, already ordered and joined: "Switch · PC · PS4". */
  platforms: string | null;
  /** The same platforms by full name, for VoiceOver; short labels are spelled out. */
  platformsSpoken?: string | null;
  onPress: (gameId: number) => void;
};

/** A game in a list: search results and recent games. */
export const GameRow = memo(
  ({
    gameId,
    name,
    coverImageId,
    releaseYear,
    platforms,
    platformsSpoken,
    onPress,
  }: GameRowProps) => {
    const { colors } = useTheme();

    return (
      <Pressable
        onPress={() => onPress(gameId)}
        accessibilityRole="button"
        accessibilityLabel={[name, releaseYear, platformsSpoken ?? platforms]
          .filter(Boolean)
          .join(', ')}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.raised }]}
      >
        <Cover imageId={coverImageId} gameId={gameId} size="cover_small" width={48} />
        <View style={styles.text}>
          <Text style={[type.headline, { color: colors.text }]} numberOfLines={2}>
            {name}
          </Text>
          <View style={styles.meta}>
            {releaseYear === null ? null : (
              <Text style={[type.subhead, tabularNumbers, { color: colors.muted }]}>
                {releaseYear}
              </Text>
            )}
            {platforms === null ? null : (
              <Text
                style={[type.subhead, styles.platforms, { color: colors.muted }]}
                numberOfLines={1}
              >
                {platforms}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    );
  },
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    minHeight: minTouchTarget,
  },
  text: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  platforms: { flexShrink: 1 },
});
