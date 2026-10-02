import { coverUrl } from '@gameplan/domain';
import type { CoverSize } from '@gameplan/domain';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import type { DimensionValue } from 'react-native';
import { radius } from '../theme';
import { useTheme } from '../use-theme';

type Props = {
  imageId: string | null;
  gameId: number;
  /** `cover_small` in lists and the grid, `cover_big` on detail (plan §8.2). */
  size: CoverSize;
  width: DimensionValue;
};

/**
 * A game's cover at 3:4, IGDB's aspect. Decorative for screen readers: the
 * game's name is always next to it. `recyclingKey` stops a recycled grid cell
 * flashing the previous game's cover while the next one loads.
 */
export const Cover = ({ imageId, gameId, size, width }: Props) => {
  const { colors } = useTheme();
  const uri = coverUrl(imageId, size);

  return (
    <View
      style={[styles.frame, { width, backgroundColor: colors.line }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {uri === null ? null : (
        <Image
          source={uri}
          recyclingKey={String(gameId)}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={120}
          cachePolicy="memory-disk"
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  frame: { aspectRatio: 3 / 4, borderRadius: radius.cover, overflow: 'hidden' },
});
