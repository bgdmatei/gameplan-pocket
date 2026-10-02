import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { minTouchTarget, radius, space, type } from '../theme';
import { useTheme } from '../use-theme';
import { PressableScale } from './pressable-scale';

export type DropdownOption<T extends string> = {
  value: T;
  label: string;
  /** Shown after the label, such as a sort's order: "A–Z". */
  detail?: string;
};

type Props<T extends string> = {
  /** What is being chosen, spoken before the current value: "Sort, Name". */
  label: string;
  options: readonly DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /**
   * Choosing the current option again calls this instead of doing nothing,
   * such as reversing a sort. Its row shows a swap icon rather than a tick.
   */
  onReselect?: (value: T) => void;
};

type Anchor = { top: number; left: number };

/**
 * A button showing the current choice that opens a small menu just below it.
 * Built on `Modal` so it floats over everything, including a grid that
 * scrolls; tapping outside the menu closes it.
 */
export const Dropdown = <T extends string>({
  label,
  options,
  value,
  onChange,
  onReselect,
}: Props<T>) => {
  const { colors } = useTheme();
  const button = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const chosen = options.find((option) => option.value === value);
  const current =
    chosen === undefined
      ? ''
      : chosen.detail === undefined
        ? chosen.label
        : `${chosen.label} · ${chosen.detail}`;

  const open = () =>
    button.current?.measureInWindow((x, y, _width, height) =>
      setAnchor({ top: y + height + space.xs, left: x }),
    );
  const close = () => setAnchor(null);

  return (
    <>
      <View ref={button} collapsable={false}>
        <PressableScale
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${current}`}
          accessibilityHint="Opens the choices"
          hitSlop={{ top: 6, bottom: 6 }}
          style={[styles.button, { backgroundColor: colors.surface, borderColor: colors.line }]}
        >
          <Text style={[type.subhead, styles.bold, { color: colors.text }]}>{current}</Text>
          <Ionicons name="chevron-down" size={14} color={colors.muted} />
        </PressableScale>
      </View>

      <Modal visible={anchor !== null} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
        {anchor === null ? null : (
          <View
            accessibilityRole="menu"
            style={[
              styles.menu,
              { top: anchor.top, left: anchor.left },
              { backgroundColor: colors.surface, borderColor: colors.line },
            ]}
          >
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    close();
                    if (!selected) onChange(option.value);
                    else onReselect?.(option.value);
                  }}
                  accessibilityRole="menuitem"
                  accessibilityLabel={
                    option.detail === undefined ? option.label : `${option.label}, ${option.detail}`
                  }
                  accessibilityHint={
                    selected && onReselect !== undefined ? 'Reverses the order' : undefined
                  }
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.item,
                    pressed && { backgroundColor: colors.raised },
                  ]}
                >
                  <Text
                    style={[
                      type.body,
                      styles.grow,
                      selected && styles.bold,
                      { color: colors.text },
                    ]}
                  >
                    {option.label}
                  </Text>
                  {option.detail === undefined ? null : (
                    <Text
                      style={[type.subhead, { color: selected ? colors.accent : colors.muted }]}
                    >
                      {option.detail}
                    </Text>
                  )}
                  <View style={styles.mark}>
                    {selected ? (
                      <Ionicons
                        name={onReselect === undefined ? 'checkmark' : 'swap-vertical'}
                        size={18}
                        color={colors.accent}
                      />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: minTouchTarget - 12,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  bold: { fontWeight: '700' },
  grow: { flex: 1 },
  /** Keeps the details lined up whether or not a row has the mark. */
  mark: { width: 18, alignItems: 'center' },
  menu: {
    position: 'absolute',
    minWidth: 240,
    paddingVertical: space.xs,
    borderRadius: radius.card,
    borderWidth: 1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: minTouchTarget,
    paddingHorizontal: space.lg,
  },
});
