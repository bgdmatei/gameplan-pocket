import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text } from 'react-native';
import { minTouchTarget, radius, space, type } from '../theme';
import { useTheme } from '../use-theme';
import { PressableScale } from './pressable-scale';

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Spoken instead of the label when the label alone is ambiguous. */
  accessibilityLabel?: string;
  /** A glyph before the label, from the app's one icon family. */
  icon?: ComponentProps<typeof Ionicons>['name'];
  /** `small` fits more in a row; its hit area stays 44 pt tall. */
  size?: 'regular' | 'small';
};

/** A filter chip: accent fill when on, outlined when off. */
export const Chip = ({
  label,
  selected,
  onPress,
  accessibilityLabel,
  icon,
  size = 'regular',
}: Props) => {
  const small = size === 'small';
  const { colors } = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      hitSlop={small ? { top: 8, bottom: 8 } : { top: 6, bottom: 6 }}
      style={[
        styles.chip,
        small && styles.small,
        selected
          ? { backgroundColor: colors.accentFill, borderColor: colors.accentFill }
          : { backgroundColor: colors.surface, borderColor: colors.line },
      ]}
    >
      {icon === undefined ? null : (
        <Ionicons name={icon} size={14} color={selected ? colors.onAccent : colors.accent} />
      )}
      <Text
        style={[
          small ? type.caption : type.subhead,
          selected && styles.bold,
          { color: selected ? colors.onAccent : colors.text },
        ]}
      >
        {label}
      </Text>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: minTouchTarget - 12,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  small: { minHeight: minTouchTarget - 16, paddingHorizontal: space.sm + 2 },
  bold: { fontWeight: '700' },
});
