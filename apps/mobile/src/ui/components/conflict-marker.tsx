import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { radius } from '../theme';
import { useTheme } from '../use-theme';

/**
 * A game with a note changed on two devices at once: the notes icon with an
 * exclamation mark, on a cover's gold badge. Callers say it to VoiceOver.
 */
export const ConflictMarker = ({ style }: { style?: StyleProp<ViewStyle> }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: colors.accentFill }, style]}>
      <Ionicons name="document-text" size={12} color={colors.onAccent} />
      <Ionicons name="alert" size={12} color={colors.onAccent} style={styles.alert} />
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 22,
    paddingHorizontal: 5,
    borderRadius: radius.pill,
  },
  // Ionicons pads every glyph: without the overlap the '!' reads as a mark of its own.
  alert: { marginLeft: -3 },
});
