import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { buttonDepth, minTouchTarget, radius, space, type } from '../theme';
import { useTheme } from '../use-theme';
import { PressableScale } from './pressable-scale';

type Props = {
  label: string;
  onPress: () => void;
  busy?: boolean;
  /** Not ready yet, such as a required choice still unmade. */
  disabled?: boolean;
  /** `destructive`: solid red, for an action that erases (Sign out, Erase; #33). */
  tone?: 'accent' | 'destructive';
};

/** The screen's one main action, in the accent fill. Disabled while it runs, so a double tap can't repeat it. */
export const PrimaryButton = ({
  label,
  onPress,
  busy = false,
  disabled = false,
  tone = 'accent',
}: Props) => {
  const { colors } = useTheme();
  const off = busy || disabled;
  const fill = tone === 'accent' ? colors.accentFill : colors.destructiveFill;
  const ink = tone === 'accent' ? colors.onAccent : colors.onDestructive;

  return (
    <PressableScale
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled: off }}
      style={[
        styles.button,
        { backgroundColor: fill, opacity: disabled ? 0.4 : busy ? 0.7 : 1 },
        // A glowing button that can't be pressed would still look ready.
        !off && { boxShadow: buttonDepth(colors, fill) },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={ink} />
      ) : (
        <Text style={[type.headline, { color: ink }]}>{label}</Text>
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
    borderRadius: radius.pill,
  },
});
