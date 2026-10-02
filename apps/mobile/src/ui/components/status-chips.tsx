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
  /**
   * The statuses that can be chosen now; the rest stay in place but dimmed
   * and untappable. Omitted, every option can be chosen.
   */
  allowed?: readonly EntryStatus[];
};

/**
 * One chip per status, always in the same order. The editor passes every
 * status and marks only the transitions the domain allows as `allowed`, so an
 * impossible change is never offered and the chips never reflow as it changes.
 */
export const StatusChips = ({ options, selected, onSelect, disabled = false, allowed }: Props) => {
  const { colors, status: statusColors } = useTheme();

  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {options.map((status) => {
        const on = status === selected;
        const off = disabled || (allowed !== undefined && !allowed.includes(status));
        return (
          <PressableScale
            key={status}
            onPress={() => {
              if (!on) onSelect(status);
            }}
            disabled={off}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled: off }}
            style={[
              styles.chip,
              off && !on && styles.unavailable,
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
  unavailable: { opacity: 0.4 },
});
