import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { radius, space, type } from '../theme';
import { useTheme } from '../use-theme';
import { PillButton } from './pill-button';

type Props = { message: string; onRetry: () => void };

/**
 * A read that failed, with a way to run it again. Shows only the fixed
 * message, never the error: a query's error can quote the row it was reading,
 * and that row may hold note text (CLAUDE.md §Privacy).
 */
export const LoadFailed = ({ message, onRetry }: Props) => {
  const { colors } = useTheme();

  return (
    <View style={styles.outer}>
      <View
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}
        accessibilityLiveRegion="polite"
      >
        <Ionicons name="alert-circle-outline" size={28} color={colors.muted} />
        <Text style={[type.body, styles.message, { color: colors.text }]}>{message}</Text>
        <PillButton label="Try again" icon="refresh" onPress={onRetry} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outer: { padding: space.lg },
  // A soft card, centred: the one thing on the screen is what went wrong.
  card: {
    alignItems: 'center',
    gap: space.md,
    padding: space.xl,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  message: { textAlign: 'center' },
});
