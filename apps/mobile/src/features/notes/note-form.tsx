import { NOTE_ITEM_TYPES, NOTE_LOCATION_MAX_LENGTH, NOTE_TEXT_MAX_LENGTH } from '@gameplan/domain';
import type { NoteItemType } from '@gameplan/domain';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Chip } from '@/ui/components/chip';
import { NOTE_TYPE_LABEL } from '@/ui/labels';
import { minTouchTarget, radius, space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

export type NoteDraft = { type: NoteItemType; text: string; location: string };

type Props = {
  draft: NoteDraft;
  onChange: (draft: NoteDraft) => void;
  /** Editing a field ended: the editor saves at once rather than waiting for the pause. */
  onBlur?: () => void;
  autoFocus?: boolean;
};

/** Type, text and location: the fields shared by adding a note and editing one. */
export const NoteForm = ({ draft, onChange, onBlur, autoFocus = false }: Props) => {
  const { colors } = useTheme();
  const input = [
    styles.input,
    { color: colors.text, borderColor: colors.line, backgroundColor: colors.surface },
  ];

  return (
    <View style={styles.form}>
      <View style={styles.wrap} accessibilityLabel="Note type">
        {NOTE_ITEM_TYPES.map((noteType) => (
          <Chip
            key={noteType}
            label={NOTE_TYPE_LABEL[noteType]}
            selected={draft.type === noteType}
            onPress={() => onChange({ ...draft, type: noteType })}
          />
        ))}
      </View>

      <View style={styles.field}>
        <Text style={[type.caption, { color: colors.muted }]}>Note</Text>
        <TextInput
          value={draft.text}
          onChangeText={(text) => onChange({ ...draft, text })}
          onBlur={onBlur}
          placeholder="What do you want to remember?"
          placeholderTextColor={colors.muted}
          multiline
          autoFocus={autoFocus}
          maxLength={NOTE_TEXT_MAX_LENGTH}
          accessibilityLabel="Note"
          style={[type.body, ...input, styles.text]}
        />
      </View>

      <View style={styles.field}>
        <Text style={[type.caption, { color: colors.muted }]}>Where (optional)</Text>
        <TextInput
          value={draft.location}
          onChangeText={(location) => onChange({ ...draft, location })}
          onBlur={onBlur}
          placeholder="Chapter 3, the old mill"
          placeholderTextColor={colors.muted}
          maxLength={NOTE_LOCATION_MAX_LENGTH}
          returnKeyType="done"
          accessibilityLabel="Where"
          style={[type.body, ...input]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  form: { gap: space.lg },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  field: { gap: space.xs },
  input: {
    minHeight: minTouchTarget,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderWidth: 1,
    borderRadius: radius.small,
  },
  text: { minHeight: 160, textAlignVertical: 'top' },
});
