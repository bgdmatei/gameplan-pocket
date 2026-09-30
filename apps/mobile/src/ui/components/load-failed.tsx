import { Pressable, StyleSheet, Text, View } from 'react-native';
import { minTouchTarget, space, type } from '../theme';
import { useTheme } from '../use-theme';

type Props = { message: string; onRetry: () => void };

/**
 * A read that failed, with a way to run it again. Shows only the fixed
 * message, never the error: a query's error can quote the row it was reading,
 * and that row may hold note text (CLAUDE.md §Privacy).
 */
export const LoadFailed = ({ message, onRetry }: Props) => {
  const { colors } = useTheme();

  return (
    <View style={styles.box} accessibilityLiveRegion="polite">
      <Text style={[type.body, { color: colors.muted }]}>{message}</Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        hitSlop={{ left: space.sm, right: space.sm }}
        style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
      >
        <Text style={[type.headline, { color: colors.accent }]}>Try again</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  box: { padding: space.lg, gap: space.sm, alignItems: 'flex-start' },
  retry: { minHeight: minTouchTarget, justifyContent: 'center' },
  pressed: { opacity: 0.6 },
});
