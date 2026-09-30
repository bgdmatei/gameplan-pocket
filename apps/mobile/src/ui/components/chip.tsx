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
};

/** A filter chip: accent fill when on, outlined when off. */
export const Chip = ({ label, selected, onPress, accessibilityLabel }: Props) => {
  const { colors } = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      hitSlop={{ top: 6, bottom: 6 }}
      style={[
        styles.chip,
        selected
          ? { backgroundColor: colors.accentFill, borderColor: colors.accentFill }
          : { backgroundColor: colors.surface, borderColor: colors.line },
      ]}
    >
      <Text
        style={[
          type.subhead,
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
    minHeight: minTouchTarget - 12,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  bold: { fontWeight: '700' },
});
