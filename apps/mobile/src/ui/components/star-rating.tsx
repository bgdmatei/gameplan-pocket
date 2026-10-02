import Ionicons from '@expo/vector-icons/Ionicons';
import { ratingToStars } from '@gameplan/domain';
import type { AccessibilityActionEvent } from 'react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { minTouchTarget } from '../theme';
import { useTheme } from '../use-theme';

type Props = {
  /** Stored 0-10; `null` is unrated. */
  rating: number | null;
  onChange: (rating: number | null) => void;
};

const STARS = [0, 1, 2, 3, 4] as const;
const STAR_SIZE = 32;
const STAR_WIDTH = 40;

const describe = (rating: number | null): string =>
  rating === null ? 'Not rated' : `${String(ratingToStars(rating))} of 5 stars`;

/**
 * Five stars in half steps: the left half of a star is a half, the right half
 * a whole. Tapping the current rating clears it. VoiceOver reads it as one
 * adjustable control, swiped up and down in half stars.
 */
export const StarRating = ({ rating, onChange }: Props) => {
  const { colors } = useTheme();
  const value = rating ?? 0;

  const choose = (next: number) => onChange(next === rating ? null : next);

  const adjust = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') onChange(Math.min(10, value + 1));
    if (event.nativeEvent.actionName === 'decrement') onChange(value <= 1 ? null : value - 1);
  };

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Rating"
      accessibilityValue={{ text: describe(rating) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={adjust}
    >
      {STARS.map((star) => {
        const half = star * 2 + 1;
        const whole = star * 2 + 2;
        const icon = value >= whole ? 'star' : value >= half ? 'star-half' : 'star-outline';
        return (
          <View key={star} style={styles.star}>
            <Ionicons
              name={icon}
              size={STAR_SIZE}
              color={value >= half ? colors.accent : colors.muted}
            />
            <Pressable style={[styles.half, styles.left]} onPress={() => choose(half)} />
            <Pressable style={[styles.half, styles.right]} onPress={() => choose(whole)} />
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  star: {
    width: STAR_WIDTH,
    height: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  half: { position: 'absolute', top: 0, bottom: 0, width: STAR_WIDTH / 2 },
  left: { left: 0 },
  right: { right: 0 },
});
