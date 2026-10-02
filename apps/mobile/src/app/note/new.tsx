import { DomainValidationError } from '@gameplan/domain';
import { Stack, router, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '@/data/database';
import { syncEnv } from '@/data/env';
import { NoteForm } from '@/features/notes/note-form';
import type { NoteDraft } from '@/features/notes/note-form';
import { createNote } from '@/features/notes/note-session';
import { HeaderButton } from '@/ui/components/header-button';
import { useToast } from '@/ui/components/toast';
import { space } from '@/ui/theme';

/** Adding a note. Nothing is written until Add: an empty note can't exist. */
const NewNoteScreen = () => {
  const insets = useSafeAreaInsets();
  const adapter = useDatabase();
  const toast = useToast();
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  const [draft, setDraft] = useState<NoteDraft>({ type: 'puzzle', text: '', location: '' });
  const [saving, setSaving] = useState(false);
  const navigation = useNavigation();
  const dirty = draft.text.trim() !== '' || draft.location.trim() !== '';

  // Back, a swipe back and Android back all land here: typed text is
  // never dropped without asking. Saving leaves the page on purpose.
  usePreventRemove(dirty && !saving, ({ data }) => {
    Alert.alert('Discard this note?', 'What you typed isn’t saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  const add = async (): Promise<void> => {
    if (saving) return;
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
      contentContainerStyle={[styles.page, { paddingBottom: space.xl + insets.bottom }]}
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen
        options={{
          headerRight: () => <HeaderButton label="Add" emphasis onPress={() => void add()} />,
        }}
      />
      <NoteForm draft={draft} onChange={setDraft} autoFocus />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.xl },
});

export default NewNoteScreen;
