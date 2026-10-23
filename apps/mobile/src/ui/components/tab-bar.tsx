import type { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { minTouchTarget, radius, space, type } from '../theme';
import { useTheme } from '../use-theme';
import { Frosted } from './frosted';
import { PressableScale } from './pressable-scale';

/** The props expo-router's `Tabs` hands a custom tab bar. */
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const BAR_HEIGHT = 64;
const GAP_BELOW = space.sm;

/**
 * What a tab screen adds to its list's bottom padding so the last row clears
 * the floating bar (MOBILE-DESIGN.md: tab screens now pad for it).
 */
export const useTabBarSpace = (): number => {
  const insets = useSafeAreaInsets();
  return BAR_HEIGHT + GAP_BELOW + Math.max(insets.bottom, space.sm);
};

/**
 * The floating, frosted tab bar from the references: inset from the screen's
 * edges, content scrolling beneath it, the active tab a gold-tinted pill.
 * Icons come from each screen's `tabBarIcon`, labels from its `title`.
 */
export const FloatingTabBar = ({ state, descriptors, navigation }: TabBarProps) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.dock, { bottom: Math.max(insets.bottom, space.sm) }]}
    >
      <Frosted style={[styles.bar, { borderColor: colors.line }]}>
        <View accessibilityRole="tablist" style={styles.row}>
          {state.routes.map((route, index) => {
            const options = descriptors[route.key]?.options;
            const selected = state.index === index;
            const label = options?.title ?? route.name;
            const tint = selected ? colors.accent : colors.muted;
            const press = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!selected && !event.defaultPrevented) navigation.navigate(route.name);
            };

            return (
              <PressableScale
                key={route.key}
                onPress={press}
                accessibilityRole="tab"
                accessibilityLabel={label}
                accessibilityState={{ selected }}
                style={[styles.tab, selected && { backgroundColor: colors.selectedFill }]}
              >
                {options?.tabBarIcon?.({ focused: selected, color: tint, size: 22 })}
                <Text style={[type.caption, styles.label, { color: tint }]}>{label}</Text>
              </PressableScale>
            );
          })}
        </View>
      </Frosted>
    </View>
  );
};

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: space.lg, right: space.lg },
  bar: {
    height: BAR_HEIGHT,
    borderRadius: radius.sheet,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.xs,
  },
  row: { flex: 1, flexDirection: 'row', gap: space.xs },
  tab: {
    flex: 1,
    minHeight: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: radius.sheet - space.xs,
  },
  label: { fontWeight: '600' },
});
