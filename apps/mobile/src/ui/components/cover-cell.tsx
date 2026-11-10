import Ionicons from '@expo/vector-icons/Ionicons';
import type { LibraryGridRow } from '@gameplan/storage';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { STATUS_LABEL } from '../labels';
import { radius, space, tabularNumbers, type } from '../theme';
import { useTheme } from '../use-theme';
import { Cover } from './cover';
import { PressableScale } from './pressable-scale';

type Props = {
  row: LibraryGridRow;
  onPress: (gameId: number) => void;
  /** The entry's platform as a short label ("PS5"), or null when it has none. */
  platform: string | null;
  /** Its full name, for VoiceOver ("PlayStation 5"). */
  platformName: string | null;
};

/**
 * One cell of the library grid. Memoised and given only primitives and a
 * stable callback (plan §12.3), so scrolling 5,000 covers re-renders only the
 * cells that change.
 */
export const CoverCell = memo(({ row, onPress, platform, platformName }: Props) => {
  const { colors } = useTheme();
  const label = [
    row.name,
    platformName,
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
        {/* A gold banner across the cover's foot, so favourites stand out in the grid. */}
        {row.favourite ? (
          <View style={[styles.banner, { backgroundColor: colors.accentFill }]}>
            <Ionicons name="star" size={12} color={colors.onAccent} />
          </View>
        ) : null}
      </View>
      <Text style={[type.caption, { color: colors.text }]} numberOfLines={2}>
        {row.name}
      </Text>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  cell: { flex: 1, gap: space.xs, padding: space.xs, paddingBottom: space.md },
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
    top: space.md,
    left: space.md,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.small,
  },
  banner: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingVertical: 3,
    // The cover's own bottom corners.
    borderBottomLeftRadius: radius.cover,
    borderBottomRightRadius: radius.cover,
  },
});
