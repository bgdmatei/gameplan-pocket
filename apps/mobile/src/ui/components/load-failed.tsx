import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { minTouchTarget, space, type } from '../theme';
import { useTheme } from '../use-theme';
import { PressableScale } from './pressable-scale';

type Props = { message: string; onRetry: () => void };

/**
 * A read that failed, with a way to run it again. Shows only the fixed
 * message, never the error: a query's error can quote the row it was reading,
 * and that row may hold note text (CLAUDE.md §Privacy).
 */
export const LoadFailed = ({ message, onRetry }: Props) => {
  const { colors } = useTheme();

  return (
    <View style={styles.outer} accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle-outline" size={28} color={colors.muted} />
      <Text style={[type.body, styles.message, { color: colors.text }]}>{message}</Text>
      <PressableScale
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Try again"
        style={styles.retry}
      >
        <Text style={[type.headline, { color: colors.accent }]}>Try again</Text>
      </PressableScale>
    </View>
  );
};

const styles = StyleSheet.create({
  outer: { alignItems: 'center', gap: space.md, padding: space.xl },
  message: { textAlign: 'center' },
  retry: { minHeight: minTouchTarget, justifyContent: 'center', paddingHorizontal: space.md },
});
