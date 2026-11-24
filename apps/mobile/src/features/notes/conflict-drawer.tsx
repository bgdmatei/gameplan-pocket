import type { ConflictChoice, NoteConflict } from '@gameplan/domain';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Frosted } from '@/ui/components/frosted';
import { PressableScale } from '@/ui/components/pressable-scale';
import { minTouchTarget, radius, space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

const CHOICES: readonly { choice: ConflictChoice; label: string }[] = [
  { choice: 'keep_current', label: 'Keep current' },
  { choice: 'keep_other', label: 'Keep other' },
  { choice: 'keep_both', label: 'Keep both' },
];

type Props = {
  conflict: NoteConflict;
  /** False until the text it is judged against is known, and while a choice saves. */
  ready: boolean;
  onChoose: (choice: ConflictChoice) => void;
};

/**
 * The other version of a note changed on two devices at once, over the bottom
 * quarter of the screen. No swipe or tap closes it: only a choice does. Back
 * still leaves the note, and the conflict stays.
 */
export const ConflictDrawer = ({ conflict, ready, onChoose }: Props) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  return (
    <Frosted
      style={[
        styles.drawer,
        { height: height / 4 + insets.bottom, paddingBottom: insets.bottom + space.md },
        { borderColor: colors.line },
      ]}
    >
      <Text style={[type.subhead, { color: colors.text }]}>
        This note was changed on two devices at once.
      </Text>
      <Text style={[type.label, { color: colors.muted }]}>OTHER VERSION</Text>
      <ScrollView style={styles.other} accessibilityLabel="Other version">
        <Text style={[type.body, { color: colors.text }]}>{conflict.text}</Text>
      </ScrollView>
      <View style={styles.choices}>
        {CHOICES.map(({ choice, label }) => (
          <PressableScale
            key={choice}
            onPress={() => onChoose(choice)}
            disabled={!ready}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: !ready }}
            style={[
              styles.choice,
              { backgroundColor: colors.surface, borderColor: colors.line },
              { opacity: ready ? 1 : 0.4 },
            ]}
          >
            <Text style={[type.callout, styles.label, { color: colors.text }]} numberOfLines={1}>
              {label}
            </Text>
          </PressableScale>
        ))}
      </View>
    </Frosted>
  );
};

const styles = StyleSheet.create({
  drawer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space.lg,
    paddingHorizontal: space.lg,
    gap: space.sm,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  other: { flex: 1 },
  choices: { flexDirection: 'row', gap: space.sm },
  choice: {
    flex: 1,
    minHeight: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: { fontWeight: '600' },
});
