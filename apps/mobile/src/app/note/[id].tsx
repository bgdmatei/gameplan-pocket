import { DomainValidationError } from '@gameplan/domain';
import type { NoteItem, NoteItemPatch } from '@gameplan/domain';
import { NOTE_ITEM_TABLES, getNoteItem } from '@gameplan/storage';
import { Stack, router, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '@/data/database';
import { syncEnv } from '@/data/env';
import { useQuery } from '@/data/use-query';
import { NoteForm } from '@/features/notes/note-form';
import type { NoteDraft } from '@/features/notes/note-form';
import { deleteNote, openNoteSession } from '@/features/notes/note-session';
import type { NoteSession } from '@/features/notes/note-session';
import { HeaderIconButton } from '@/ui/components/header-button';
import { LoadFailed } from '@/ui/components/load-failed';
import { useToast } from '@/ui/components/toast';
import { minTouchTarget, space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

const NoteScreen = () => {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const note = useQuery((db) => getNoteItem(db, id), NOTE_ITEM_TABLES, [id]);
  // One local row: it arrives within a frame, before a placeholder could be read.
  if (note.status === 'loading') return null;
  if (note.status === 'failed') {
    return <LoadFailed message="This note couldn’t be read." onRetry={note.retry} />;
  }
  if (note.data === null) {
    return (
      <View style={styles.page}>
        <Text style={[type.body, { color: colors.muted }]}>This note was deleted.</Text>
      </View>
    );
  }
  return <NoteEditor note={note.data} />;
};

/**
 * Edits one note in a session (see `openNoteSession`). Type, text and
 * location are a draft until Save, which writes them as one op; leaving
 * with unsaved changes asks first, as adding a note does. Resolved is a
 * toggle and saves at once. A refresh from the database never overwrites
 * the draft.
 */
const NoteEditor = ({ note }: { note: NoteItem }) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const adapter = useDatabase();
  const toast = useToast();
  const navigation = useNavigation();
  const [draft, setDraft] = useState<NoteDraft>({
    type: note.type,
    text: note.text,
    location: note.location ?? '',
  });
  const [resolved, setResolved] = useState(note.resolved);
  // Saving or deleting leaves the page on purpose, without the discard question.
  const [leaving, setLeaving] = useState(false);
  const session = useRef<Promise<NoteSession> | null>(null);

  useEffect(() => {
    session.current = openNoteSession(adapter, syncEnv, note.id);
  }, [adapter, note.id]);

  const dirty =
    draft.type !== note.type ||
    draft.text !== note.text ||
    draft.location !== (note.location ?? '');

  usePreventRemove(dirty && !leaving, ({ data }) => {
    Alert.alert('Discard your changes?', 'What you changed isn’t saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  /** Resolves `false` when the change was refused or failed, after saying so. */
  const save = async (patch: NoteItemPatch): Promise<boolean> => {
    if (session.current === null) return false;
    try {
      await (await session.current).save(patch);
      return true;
    } catch (error) {
      // Reasons only, never the text (CLAUDE.md §Privacy).
      if (error instanceof DomainValidationError) toast.showRejected(error);
      else toast.show('The note couldn’t be saved. Try again.');
      return false;
    }
  };

  const saveDraft = async (): Promise<void> => {
    if (leaving) return;
    setLeaving(true);
    // An unchanged draft writes nothing: the session sends no op for it.
    if (await save({ type: draft.type, text: draft.text, location: draft.location })) {
      router.back();
    } else {
      setLeaving(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert('Delete this note?', 'It is removed from every device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setLeaving(true);
          deleteNote(adapter, syncEnv, note.id).then(
            () => router.back(),
            () => {
              setLeaving(false);
              toast.show('The note couldn’t be deleted. Try again.');
            },
          );
        },
      },
    ]);

  return (
    <ScrollView
      contentContainerStyle={[styles.page, { paddingBottom: space.xl + insets.bottom }]}
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen
        options={{
          // iOS 26 groups `headerRight` into one glass pill; as native bar
          // items that don't share a background, delete and save get a pill each.
          unstable_headerRightItems: () => [
            {
              type: 'button',
              label: 'Delete note',
              icon: { type: 'sfSymbol', name: 'trash' },
              tintColor: colors.danger,
              sharesBackground: false,
              onPress: confirmDelete,
            },
            {
              type: 'button',
              label: 'Save note',
              icon: { type: 'sfSymbol', name: 'checkmark' },
              tintColor: colors.accent,
              sharesBackground: false,
              onPress: () => void saveDraft(),
            },
          ],
          // Android and older iOS.
          headerRight: () => (
            <View style={styles.headerActions}>
              <HeaderIconButton
                icon="trash-outline"
                label="Delete note"
                danger
                onPress={confirmDelete}
              />
              <HeaderIconButton
                icon="checkmark"
                label="Save note"
                onPress={() => void saveDraft()}
              />
            </View>
          ),
        }}
      />
      <NoteForm draft={draft} onChange={setDraft} />

      <View style={styles.switchRow}>
        <Text style={[type.body, { color: colors.text }]}>Resolved</Text>
        <Switch
          value={resolved}
          onValueChange={(next) => {
            setResolved(next);
            void save({ resolved: next });
          }}
          trackColor={{ true: colors.accentFill, false: colors.line }}
          accessibilityLabel="Resolved"
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.xl },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: minTouchTarget,
  },
});

export default NoteScreen;
