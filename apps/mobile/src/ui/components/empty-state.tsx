import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { space, type } from '../theme';
import { useTheme } from '../use-theme';

type Props = {
  /** A glyph above the message; a spinner instead while `busy`. */
  icon: ComponentProps<typeof Ionicons>['name'];
  message: string;
  busy?: boolean;
};

/** What a list says when it has nothing to show: centred, muted, with an icon. */
export const EmptyState = ({ icon, message, busy = false }: Props) => {
  const { colors } = useTheme();

  return (
    <View style={styles.box} accessibilityLiveRegion="polite">
      {busy ? (
        <ActivityIndicator color={colors.muted} />
      ) : (
        <Ionicons name={icon} size={32} color={colors.muted} />
      )}
      <Text style={[type.body, styles.message, { color: colors.muted }]}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  box: { alignItems: 'center', gap: space.md, paddingHorizontal: space.xl, paddingTop: space.xxl },
  message: { textAlign: 'center' },
});
