import Ionicons from '@expo/vector-icons/Ionicons';
import type { ConflictChoice, NoteConflict } from '@gameplan/domain';
import type { ComponentProps } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Frosted } from '@/ui/components/frosted';
import { PressableScale } from '@/ui/components/pressable-scale';
import { buttonDepth, minTouchTarget, radius, space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

const BUTTON_HEIGHT = minTouchTarget + 4;

/** Where the drawer floats above the screen's bottom edge. */
const lift = (bottomInset: number): number => Math.max(bottomInset, space.sm);

/** What the note screen pads its content by, given the drawer's measured height. */
export const conflictDrawerSpace = (drawerHeight: number, bottomInset: number): number =>
  drawerHeight + lift(bottomInset) + space.lg;

type IconName = ComponentProps<typeof Ionicons>['name'];

const SIDE_CHOICES: readonly { choice: ConflictChoice; label: string; icon: IconName }[] = [
  { choice: 'keep_current', label: 'Keep current', icon: 'phone-portrait-outline' },
  { choice: 'keep_other', label: 'Keep other', icon: 'swap-horizontal-outline' },
];

type Props = {
  conflict: NoteConflict;
  /** False until the text it is judged against is known, and while a choice saves. */
  ready: boolean;
  onChoose: (choice: ConflictChoice) => void;
  /** The drawer's height once laid out: it grows with Dynamic Type. */
  onHeight: (height: number) => void;
};

/**
 * The other version of a note changed on two devices at once, floating over
 * the bottom of the screen. No swipe or tap closes it: only a choice does.
 * Back still leaves the note, and the conflict stays. Keep both is the main
 * choice, since it is the only one that loses nothing.
 */
export const ConflictDrawer = ({ conflict, ready, onChoose, onHeight }: Props) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  return (
    // The shadow lives here: Frosted clips to its corners, and would clip it.
    <View
      onLayout={(event) => onHeight(event.nativeEvent.layout.height)}
      style={[
        styles.drawer,
        {
          bottom: lift(insets.bottom),
          boxShadow: `0 -8px 32px ${colors.panelShadow}`,
        },
      ]}
    >
      <Frosted style={[StyleSheet.absoluteFill, styles.backdrop, { borderColor: colors.line }]} />
      <View style={styles.warning}>
        <Ionicons name="alert-circle" size={18} color={colors.danger} />
        <Text style={[type.subhead, styles.warningText, { color: colors.danger }]}>
          This note was changed on two devices at once.
        </Text>
      </View>
      <Text style={[type.label, { color: colors.muted }]}>OTHER VERSION</Text>
      <ScrollView
        // Sized by the screen, never below three lines, so a small phone still shows the text.
        style={{ height: Math.max(3 * type.body.lineHeight, height / 12) }}
        accessibilityLabel="Other version"
      >
        <Text style={[type.body, { color: colors.text }]}>{conflict.text}</Text>
      </ScrollView>
      <View style={styles.row}>
        {SIDE_CHOICES.map(({ choice, label, icon }) => (
          <PressableScale
            key={choice}
            onPress={() => onChoose(choice)}
            disabled={!ready}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: !ready }}
            style={[
              styles.choice,
              styles.side,
              { backgroundColor: colors.surface, borderColor: colors.line },
              { opacity: ready ? 1 : 0.4 },
            ]}
          >
            <Ionicons name={icon} size={18} color={colors.text} />
            <Text style={[type.callout, styles.label, { color: colors.text }]} numberOfLines={1}>
              {label}
            </Text>
          </PressableScale>
        ))}
      </View>
      <PressableScale
        onPress={() => onChoose('keep_both')}
        disabled={!ready}
        accessibilityRole="button"
        accessibilityLabel="Keep both"
        accessibilityState={{ disabled: !ready }}
        style={[
          styles.choice,
          { backgroundColor: colors.accentFill, opacity: ready ? 1 : 0.4 },
          ready && { boxShadow: buttonDepth(colors, colors.accentFill) },
        ]}
      >
        <Ionicons name="layers-outline" size={18} color={colors.onAccent} />
        <Text style={[type.callout, styles.label, { color: colors.onAccent }]} numberOfLines={1}>
          Keep both
        </Text>
      </PressableScale>
    </View>
  );
};

const styles = StyleSheet.create({
  drawer: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    padding: space.lg,
    gap: space.sm,
    borderRadius: radius.sheet,
  },
  backdrop: { borderRadius: radius.sheet, borderWidth: StyleSheet.hairlineWidth },
  warning: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  warningText: { flex: 1 },
  row: { flexDirection: 'row', gap: space.sm },
  choice: {
    minHeight: BUTTON_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
  },
  side: { flex: 1, borderWidth: StyleSheet.hairlineWidth },
  label: { fontWeight: '600' },
});
