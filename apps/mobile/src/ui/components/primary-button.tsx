import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { minTouchTarget, radius, space, type } from '../theme';
import { useTheme } from '../use-theme';
import { PressableScale } from './pressable-scale';

type Props = {
  label: string;
  onPress: () => void;
  busy?: boolean;
  /** Not ready yet, such as a required choice still unmade. */
  disabled?: boolean;
};

/** The screen's one main action, in the accent fill. Disabled while it runs, so a double tap can't repeat it. */
export const PrimaryButton = ({ label, onPress, busy = false, disabled = false }: Props) => {
  const { colors } = useTheme();
  const off = busy || disabled;

  return (
    <PressableScale
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled: off }}
      style={[
        styles.button,
        { backgroundColor: colors.accentFill, opacity: disabled ? 0.4 : busy ? 0.7 : 1 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={colors.onAccent} />
      ) : (
        <Text style={[type.headline, { color: colors.onAccent }]}>{label}</Text>
      )}
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  button: {
    minHeight: minTouchTarget + 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    borderRadius: radius.small,
  },
});
