import { coverUrl } from '@gameplan/domain';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import type { DimensionValue } from 'react-native';
import { gradients, radius, space, type } from '../theme';
import { useTheme } from '../use-theme';
import { PressableScale } from './pressable-scale';

type Props = {
  imageId: string | null;
  gameId: number;
  /** Small uppercase line above the title ("NOW PLAYING"). */
  label: string;
  title: string;
  /** A line under the title, in the same muted white as the label. */
  caption?: string;
  width: DimensionValue;
  onPress: () => void;
};

/**
 * A game's cover carrying its own label and title, like the references'
 * "Daily Horoscope" card. Text sits only in the lower part, below the
 * gradient's text stop, so it reads even on a white cover (theme.test.ts).
 */
export const ImageCard = ({ imageId, gameId, label, title, caption, width, onPress }: Props) => {
  const { colors } = useTheme();
  const uri = coverUrl(imageId, 'cover_big');

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={caption === undefined ? `${title}, ${label}` : `${title}, ${caption}`}
      style={[styles.card, { width, backgroundColor: colors.raised }]}
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
      <LinearGradient
        colors={gradients.overImage.colors}
        locations={gradients.overImage.locations}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.text}>
        <Text style={[type.label, { color: colors.onImageMuted }]}>{label.toUpperCase()}</Text>
        <Text style={[type.displaySmall, { color: colors.onImage }]} numberOfLines={3}>
          {title}
        </Text>
        {caption === undefined ? null : (
          <Text style={[type.subhead, { color: colors.onImageMuted }]} numberOfLines={1}>
            {caption}
          </Text>
        )}
      </View>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  card: { aspectRatio: 3 / 4, borderRadius: radius.card, overflow: 'hidden' },
  text: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // Keeps text in the gradient's dark lower part (its text stop is at 60%).
    maxHeight: '40%',
    justifyContent: 'flex-end',
    gap: space.xs,
    padding: space.lg,
  },
});
