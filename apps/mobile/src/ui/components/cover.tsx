import { coverUrl } from '@gameplan/domain';
import type { CoverSize } from '@gameplan/domain';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import type { DimensionValue } from 'react-native';
import { localCoverUri } from '@/data/cover-store';
import { radius } from '../theme';
import { useTheme } from '../use-theme';

type Props = {
  imageId: string | null;
  gameId: number;
  size: CoverSize;
  /** A smaller size, likely cached from the grid, shown until `size` loads. */
  placeholderSize?: CoverSize;
  width: DimensionValue;
};

/**
 * A game's cover at 3:4, IGDB's aspect. Decorative for screen readers: the
 * game's name is always next to it. `recyclingKey` stops a recycled grid cell
 * flashing the previous game's cover while the next one loads.
 */
export const Cover = ({ imageId, gameId, size, placeholderSize, width }: Props) => {
  const { colors } = useTheme();
  // The stored copy, when there is one, is the same cover_big file (#27).
  const fromPhone = (wanted: CoverSize) =>
    (wanted === 'cover_big' ? localCoverUri(imageId) : null) ?? coverUrl(imageId, wanted);
  const uri = fromPhone(size);
  const placeholder = placeholderSize === undefined ? null : fromPhone(placeholderSize);

  return (
    <View
      style={[styles.frame, { width, backgroundColor: colors.line }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {uri === null ? null : (
        <Image
          source={uri}
          placeholder={placeholder}
          placeholderContentFit="cover"
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
