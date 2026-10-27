import { coverUrl } from '@gameplan/domain';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { space } from '../theme';
import { useTheme } from '../use-theme';
import { Cover } from './cover';

/** How soft the backdrop is: enough that the cover reads as colour, not as a picture. */
const BACKDROP_BLUR = 40;
/** The sharp cover's share of the hero's width, in `backdrop`. */
const COVER_SHARE = 0.6;

const backdropCoverWidth = (width: number): number => Math.round(width * COVER_SHARE);

/** A `backdrop` hero's height: the header, then the whole cover (3:4), then a gap above the name. */
export const backdropHeroHeight = (width: number, topInset: number): number =>
  topInset + space.sm + Math.round((backdropCoverWidth(width) * 4) / 3) + space.lg;

type Props = {
  imageId: string | null;
  gameId: number;
  height: number;
  /**
   * `full`: the cover full-width, top-aligned, its bottom cropped.
   * `backdrop`: a blurred, enlarged copy behind the whole cover, sharp (spec
   * open question 1's alternative, since covers are portrait).
   */
  variant?: 'full' | 'backdrop';
  /** Where the header ends, so the sharp cover in `backdrop` starts below it. */
  topInset?: number;
  width?: number;
};

/**
 * A game's cover full-width behind the top of a screen, fading into the
 * ground, like the references' "Daily Horoscope" page. Text goes below it on
 * the solid ground, in the theme's own text colour.
 */
export const Hero = ({
  imageId,
  gameId,
  height,
  variant = 'full',
  topInset = 0,
  width = 0,
}: Props) => {
  const { colors } = useTheme();
  const uri = coverUrl(imageId, 'cover_big');
  const backdrop = variant === 'backdrop';

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
          contentPosition={backdrop ? 'center' : 'top'}
          blurRadius={backdrop ? BACKDROP_BLUR : 0}
          transition={160}
          cachePolicy="memory-disk"
        />
      )}
      <LinearGradient
        colors={[colors.heroFadeFrom, colors.background]}
        locations={[0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      {backdrop ? (
        <View style={[styles.cover, { paddingTop: topInset + space.sm }]}>
          <Cover
            imageId={imageId}
            gameId={gameId}
            size="cover_big"
            width={backdropCoverWidth(width)}
          />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  hero: { width: '100%', overflow: 'hidden' },
  cover: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
});
