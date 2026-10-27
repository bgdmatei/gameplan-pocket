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
  /** Small uppercase line above the title ("NOW PLAYING"); none when a heading already says it. */
  label?: string;
  title: string;
  /** A line under the title, in the same muted white as the label. */
  caption?: string;
  /** The caption as VoiceOver should read it, when it uses short forms ("PS5"). */
  spokenCaption?: string;
  width: DimensionValue;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityHint?: string;
  /** `small`: a smaller title and tighter padding, for a row of several cards. */
  size?: 'regular' | 'small';
};

/**
 * A game's cover carrying its own label and title, like the references'
 * "Daily Horoscope" card. Text sits only in the lower part, below the
 * gradient's text stop, so it reads even on a white cover (theme.test.ts).
 */
export const ImageCard = ({
  imageId,
  gameId,
  label,
  title,
  caption,
  spokenCaption,
  width,
  onPress,
  onLongPress,
  accessibilityHint,
  size = 'regular',
}: Props) => {
  const { colors } = useTheme();
  const small = size === 'small';
  const uri = coverUrl(imageId, 'cover_big');
  const spoken = [title, spokenCaption ?? caption ?? label].filter(Boolean).join(', ');

  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint={accessibilityHint}
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
      <View style={[styles.text, small && styles.smallText]}>
        {label === undefined ? null : (
          <Text style={[type.label, { color: colors.onImageMuted }]}>{label.toUpperCase()}</Text>
        )}
        <Text
          style={[small ? type.displayCaption : type.displaySmall, { color: colors.onImage }]}
          numberOfLines={small ? 2 : 3}
        >
          {title}
        </Text>
        {caption === undefined ? null : (
          <Text
            style={[small ? type.caption : type.subhead, { color: colors.onImageMuted }]}
            numberOfLines={1}
          >
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
  smallText: { gap: 2, padding: space.sm },
});
