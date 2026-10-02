import { StyleSheet, View } from 'react-native';
import type { DimensionValue } from 'react-native';
import { radius, space } from '../theme';
import { useTheme } from '../use-theme';

type BlockProps = { width: DimensionValue; height?: number; aspectRatio?: number; round?: number };

/**
 * A still placeholder in the shape of what is loading. Local reads take a
 * few milliseconds, so it doesn't shimmer: a pulse would only flash.
 */
export const SkeletonBlock = ({ width, height, aspectRatio, round = radius.small }: BlockProps) => {
  const { colors } = useTheme();
  return (
    <View
      style={{ width, height, aspectRatio, borderRadius: round, backgroundColor: colors.surface }}
    />
  );
};

/** Three rows of the library grid, while its first page loads. */
export const CoverGridSkeleton = () => (
  <View
    style={styles.grid}
    accessible
    accessibilityLabel="Loading your library"
    accessibilityState={{ busy: true }}
  >
    {Array.from({ length: 9 }, (_, index) => (
      <View key={index} style={styles.cell}>
        <SkeletonBlock width="100%" aspectRatio={3 / 4} round={radius.cover} />
        <SkeletonBlock width="80%" height={12} round={radius.pill} />
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: space.md },
  cell: { width: '33.333%', padding: space.xs, gap: space.sm },
});
