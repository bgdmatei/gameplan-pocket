import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text } from 'react-native';
import { space, type } from '../theme';
import { useTheme } from '../use-theme';
import { PressableScale } from './pressable-scale';

type Props = { label: string; onPress: () => void; emphasis?: boolean };

/** A text button in a native header: Cancel, Done. */
export const HeaderButton = ({ label, onPress, emphasis = false }: Props) => {
  const { colors } = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={space.sm}
      style={styles.button}
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
};

/**
 * An icon action in a native header: add, archive, delete. Screen-wide
 * actions live here rather than midway down the page.
 */
export const HeaderIconButton = ({ icon, label, onPress, danger = false }: IconProps) => {
  const { colors } = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={space.sm}
      style={styles.icon}
    >
      <Ionicons name={icon} size={22} color={danger ? colors.danger : colors.accent} />
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
