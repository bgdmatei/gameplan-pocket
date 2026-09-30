import { DomainValidationError } from '@gameplan/domain';
import { Stack, router, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { useDatabase } from '@/data/database';
import { syncEnv } from '@/data/env';
import { NoteForm } from '@/features/notes/note-form';
import type { NoteDraft } from '@/features/notes/note-form';
import { createNote } from '@/features/notes/note-session';
import { HeaderButton } from '@/ui/components/header-button';
import { PrimaryButton } from '@/ui/components/primary-button';
import { useToast } from '@/ui/components/toast';
import { space } from '@/ui/theme';

/** Adding a note. Nothing is written until "Add note": an empty note can't exist. */
const NewNoteScreen = () => {
  const adapter = useDatabase();
  const toast = useToast();
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  const [draft, setDraft] = useState<NoteDraft>({ type: 'puzzle', text: '', location: '' });
  const [saving, setSaving] = useState(false);
  const navigation = useNavigation();
  const dirty = draft.text.trim() !== '' || draft.location.trim() !== '';

  // Cancel, a swipe down and Android back all land here: typed text is
  // never dropped without asking. Saving closes the modal on purpose.
  usePreventRemove(dirty && !saving, ({ data }) => {
    Alert.alert('Discard this note?', 'What you typed isn’t saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  const add = async (): Promise<void> => {
    setSaving(true);
    try {
      await createNote(adapter, syncEnv, {
        entryId,
        type: draft.type,
        text: draft.text,
        location: draft.location,
      });
      router.back();
    } catch (error) {
      // Reasons only, never the text (CLAUDE.md §Privacy).
      if (error instanceof DomainValidationError) toast.showRejected(error);
      else toast.show('The note couldn’t be added. Try again.');
      setSaving(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen
        options={{
          headerLeft: () => <HeaderButton label="Cancel" onPress={() => router.back()} />,
        }}
      />
      <NoteForm draft={draft} onChange={setDraft} autoFocus />
      <PrimaryButton label="Add note" onPress={() => void add()} busy={saving} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.xl },
});

export default NewNoteScreen;
