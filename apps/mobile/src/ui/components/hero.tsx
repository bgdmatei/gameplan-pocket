import { coverUrl } from '@gameplan/domain';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../use-theme';

type Props = {
  imageId: string | null;
  gameId: number;
  height: number;
};

/**
 * A game's cover full-width behind the top of a screen, fading into the
 * ground, like the references' "Daily Horoscope" page. Covers are portrait, so
 * it is top-aligned and cropped at the bottom (spec open question 1). Text goes
 * below it on the solid ground, in the theme's own text colour.
 */
export const Hero = ({ imageId, gameId, height }: Props) => {
  const { colors } = useTheme();
  const uri = coverUrl(imageId, 'cover_big');

  return (
    <View
      style={[styles.hero, { height, backgroundColor: colors.background }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {uri === null ? null : (
        <Image
          source={uri}
          recyclingKey={String(gameId)}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition="top"
          transition={160}
          cachePolicy="memory-disk"
        />
      )}
      <LinearGradient
        colors={[colors.heroFadeFrom, colors.background]}
        locations={[0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
};

const styles = StyleSheet.create({ hero: { width: '100%', overflow: 'hidden' } });
