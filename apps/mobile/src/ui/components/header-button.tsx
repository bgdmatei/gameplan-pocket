import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text } from 'react-native';
import { space, type } from '../theme';
import { useTheme } from '../use-theme';
import { PressableScale } from './pressable-scale';

type Props = { label: string; onPress: () => void; emphasis?: boolean; disabled?: boolean };

/** A text button in a native header: Cancel, Done. */
export const HeaderButton = ({ label, onPress, emphasis = false, disabled = false }: Props) => {
  const { colors } = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      hitSlop={space.sm}
      style={[styles.button, { opacity: disabled ? 0.4 : 1 }]}
    >
      <Text style={[emphasis ? type.headline : type.body, { color: colors.accent }]}>{label}</Text>
    </PressableScale>
  );
};

type IconProps = {
  icon: ComponentProps<typeof Ionicons>['name'];
  /** Spoken, since the icon alone says nothing to VoiceOver. */
  label: string;
  onPress: () => void;
  danger?: boolean;
  /** A confirming action, such as Save: in `success` green. */
  success?: boolean;
  disabled?: boolean;
};

/**
 * An icon action in a native header: add, archive, delete. Screen-wide
 * actions live here rather than midway down the page.
 */
export const HeaderIconButton = ({
  icon,
  label,
  onPress,
  danger = false,
  success = false,
  disabled = false,
}: IconProps) => {
  const { colors } = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={space.sm}
      style={[styles.icon, { opacity: disabled ? 0.4 : 1 }]}
    >
      <Ionicons
        name={icon}
        size={22}
        color={danger ? colors.danger : success ? colors.success : colors.accent}
      />
    </PressableScale>
  );
};

const HEADER_ICON_BOX = 36;

const styles = StyleSheet.create({
  button: { paddingHorizontal: space.xs },
  // iOS 26 wraps each header item in a glass pill: a centred square keeps
  // the icon in its middle. hitSlop brings the target up to 44 pt.
  icon: {
    width: HEADER_ICON_BOX,
    height: HEADER_ICON_BOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
