import type { EntryStatus } from '@gameplan/domain';
import { StyleSheet, Text, View } from 'react-native';
import { STATUS_LABEL } from '../labels';
import { minTouchTarget, radius, space, statusDot, type } from '../theme';
import { useTheme } from '../use-theme';
import { PressableScale } from './pressable-scale';

type Props = {
  options: readonly EntryStatus[];
  selected: EntryStatus;
  onSelect: (status: EntryStatus) => void;
  disabled?: boolean;
};

/**
 * One chip per status that can be chosen here. The editor passes only the
 * transitions the domain allows, so an impossible change is never offered.
 */
export const StatusChips = ({ options, selected, onSelect, disabled = false }: Props) => {
  const { colors, status: statusColors } = useTheme();

  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {options.map((status) => {
        const on = status === selected;
        return (
          <PressableScale
            key={status}
            onPress={() => onSelect(status)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled }}
            style={[
              styles.chip,
              {
                borderColor: on ? statusColors[status] : colors.line,
                backgroundColor: colors.surface,
              },
            ]}
          >
            <View style={[styles.dot, { backgroundColor: statusColors[status] }]} />
            <Text
              style={[
                type.subhead,
                on && styles.bold,
                { color: on ? statusColors[status] : colors.text },
              ]}
            >
              {STATUS_LABEL[status]}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: minTouchTarget,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  dot: { width: statusDot, height: statusDot, borderRadius: statusDot / 2 },
  bold: { fontWeight: '700' },
});
