import type { EntryStatus } from '@gameplan/domain';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { STATUS_LABEL } from '../labels';
import { minTouchTarget, space, statusDot, tabularNumbers, type } from '../theme';
import { useTheme } from '../use-theme';
import { Cover } from './cover';

export type GameRowProps = {
  gameId: number;
  name: string;
  coverImageId: string | null;
  releaseYear: string | null;
  /** `null`: not in the library. */
  status: EntryStatus | null;
  onPress: (gameId: number) => void;
};

/** A game in a list: search results and recent games. */
export const GameRow = memo(
  ({ gameId, name, coverImageId, releaseYear, status, onPress }: GameRowProps) => {
    const { colors, status: statusColors } = useTheme();
    const inLibrary = status === null ? null : `In library, ${STATUS_LABEL[status]}`;

    return (
      <Pressable
        onPress={() => onPress(gameId)}
        accessibilityRole="button"
        accessibilityLabel={[name, releaseYear, inLibrary].filter(Boolean).join(', ')}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
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
            {status === null ? null : (
              <View style={styles.status}>
                <View style={[styles.dot, { backgroundColor: statusColors[status] }]} />
                <Text style={[type.subhead, { color: statusColors[status] }]}>
                  {STATUS_LABEL[status]}
                </Text>
              </View>
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
  status: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  dot: { width: statusDot, height: statusDot, borderRadius: statusDot / 2 },
});
