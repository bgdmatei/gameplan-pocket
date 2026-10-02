import Ionicons from '@expo/vector-icons/Ionicons';
import type { LibraryGridRow } from '@gameplan/storage';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { STATUS_LABEL } from '../labels';
import { radius, space, statusDot, tabularNumbers, type } from '../theme';
import { useTheme } from '../use-theme';
import { Cover } from './cover';
import { PressableScale } from './pressable-scale';

type Props = {
  row: LibraryGridRow;
  onPress: (gameId: number) => void;
  /** False when the grid is filtered to one status: every cell would say the same. */
  showStatus: boolean;
  /** The entry's platform as a short label ("PS5"), or null when it has none. */
  platform: string | null;
};

/**
 * One cell of the library grid. Memoised and given only primitives and a
 * stable callback (plan §12.3), so scrolling 5,000 covers re-renders only the
 * cells that change.
 */
export const CoverCell = memo(({ row, onPress, showStatus, platform }: Props) => {
  const { colors, status } = useTheme();
  const label = [
    row.name,
    platform,
    STATUS_LABEL[row.status],
    row.favourite ? 'favourite' : null,
    row.openNotes > 0 ? `${String(row.openNotes)} open notes` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <PressableScale
      onPress={() => onPress(row.gameId)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.cell}
    >
      <View>
        <Cover imageId={row.coverImageId} gameId={row.gameId} size="cover_small" width="100%" />
        {platform === null ? null : (
          <View style={[styles.platform, { backgroundColor: colors.surface }]}>
            <Text style={[type.label, { color: colors.text }]}>{platform}</Text>
          </View>
        )}
        {row.openNotes > 0 ? (
          <View style={[styles.badge, { backgroundColor: colors.accentFill }]}>
            <Text style={[type.label, tabularNumbers, { color: colors.onAccent }]}>
              {row.openNotes}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={[type.caption, { color: colors.text }]} numberOfLines={2}>
        {row.name}
      </Text>
      {showStatus || row.favourite ? (
        <View style={styles.status}>
          {showStatus ? (
            <>
              <View style={[styles.dot, { backgroundColor: status[row.status] }]} />
              <Text style={[type.caption, styles.label, { color: colors.muted }]} numberOfLines={1}>
                {STATUS_LABEL[row.status]}
              </Text>
            </>
          ) : null}
          {row.favourite ? <Ionicons name="star" size={12} color={colors.accent} /> : null}
        </View>
      ) : null}
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  cell: { flex: 1, gap: space.xs, padding: space.xs },
  badge: {
    position: 'absolute',
    top: space.xs,
    right: space.xs,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  platform: {
    position: 'absolute',
    top: space.lg,
    left: space.lg,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.small,
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  label: { flexShrink: 1 },
  dot: { width: statusDot, height: statusDot, borderRadius: statusDot / 2 },
});
