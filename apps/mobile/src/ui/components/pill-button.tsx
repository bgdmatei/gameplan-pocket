import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { minTouchTarget, radius, space, type } from '../theme';
import { useTheme } from '../use-theme';
import { Frosted } from './frosted';
import { PressableScale } from './pressable-scale';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * `filled`: the gold fill, for the one main action. `frosted`: translucent, for
 * secondary actions laid over art or the ground, like the references' share row.
 */
type Variant = 'filled' | 'frosted';

type PillProps = {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: Variant;
  disabled?: boolean;
};

/** A full-height pill with a label, and an icon before it if given. */
export const PillButton = ({
  label,
  onPress,
  icon,
  variant = 'frosted',
  disabled = false,
}: PillProps) => {
  const { colors } = useTheme();
  const filled = variant === 'filled';
  const ink = filled ? colors.onAccent : colors.text;
  const content = (
    <>
      {icon === undefined ? null : <Ionicons name={icon} size={18} color={ink} />}
      <Text style={[type.headline, { color: ink }]}>{label}</Text>
    </>
  );

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[styles.pill, { opacity: disabled ? 0.4 : 1 }]}
    >
      {filled ? (
        // Solid gold: blur would cost frames for nothing, and its Reduce
        // Transparency fallback would paint over the gold.
        <View style={[styles.fill, { backgroundColor: colors.accentFill }]}>{content}</View>
      ) : (
        <Frosted style={[styles.fill, { borderColor: colors.line }, styles.edge]}>
          {content}
        </Frosted>
      )}
    </PressableScale>
  );
};

type RoundProps = {
  icon: IconName;
  /** Spoken, since the icon alone says nothing to VoiceOver. */
  label: string;
  onPress: () => void;
  variant?: Variant;
};

/** A round icon button: 44 pt, frosted by default. */
export const RoundButton = ({ icon, label, onPress, variant = 'frosted' }: RoundProps) => {
  const { colors } = useTheme();
  const filled = variant === 'filled';

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.round}
    >
      {filled ? (
        <View style={[styles.roundFill, { backgroundColor: colors.accentFill }]}>
          <Ionicons name={icon} size={20} color={colors.onAccent} />
        </View>
      ) : (
        <Frosted style={[styles.roundFill, styles.edge, { borderColor: colors.line }]}>
          <Ionicons name={icon} size={20} color={colors.text} />
        </Frosted>
      )}
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  pill: { minHeight: minTouchTarget + 4, borderRadius: radius.pill },
  fill: {
    flexGrow: 1,
    minHeight: minTouchTarget + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
  },
  edge: { borderWidth: StyleSheet.hairlineWidth },
  round: { width: minTouchTarget, height: minTouchTarget, borderRadius: radius.pill },
  roundFill: {
    width: minTouchTarget,
    height: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
});
