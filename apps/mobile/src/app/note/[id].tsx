import { DomainValidationError } from '@gameplan/domain';
import type { NoteItem, NoteItemPatch } from '@gameplan/domain';
import { NOTE_ITEM_TABLES, getNoteItem } from '@gameplan/storage';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useDatabase } from '@/data/database';
import { syncEnv } from '@/data/env';
import { useQuery } from '@/data/use-query';
import { NoteForm } from '@/features/notes/note-form';
import type { NoteDraft } from '@/features/notes/note-form';
import { deleteNote, openNoteSession } from '@/features/notes/note-session';
import type { NoteSession } from '@/features/notes/note-session';
import { LoadFailed } from '@/ui/components/load-failed';
import { PressableScale } from '@/ui/components/pressable-scale';
import { useToast } from '@/ui/components/toast';
import { minTouchTarget, space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

/** Typing pauses this long before the text is saved; leaving a field saves at once. */
const PAUSE_MS = 1_500;

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
 * Edits one note in a session (see `openNoteSession`). The fields are the
 * user's own draft from the moment the editor opens: a refresh from the
 * database never overwrites what they are typing.
 */
const NoteEditor = ({ note }: { note: NoteItem }) => {
  const { colors } = useTheme();
  const adapter = useDatabase();
  const toast = useToast();
  const [draft, setDraft] = useState<NoteDraft>({
    type: note.type,
    text: note.text,
    location: note.location ?? '',
  });
  const [resolved, setResolved] = useState(note.resolved);
  const session = useRef<Promise<NoteSession> | null>(null);
  const latest = useRef(draft);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleted = useRef(false);

  const save = async (patch: NoteItemPatch): Promise<void> => {
    if (session.current === null || deleted.current) return;
    try {
      await (await session.current).save(patch);
    } catch (error) {
      // Reasons only, never the text (CLAUDE.md §Privacy).
      if (error instanceof DomainValidationError) toast.showRejected(error);
      else toast.show('The note couldn’t be saved. Try again.');
    }
  };

  /** Saves the typed fields now. A blank note waits: clearing it to retype isn't an error. */
  const flush = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    const { text, location } = latest.current;
    if (text.trim() !== '') void save({ text, location });
  };

  // The ref keeps the latest `flush` for the unmount cleanup below.
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    session.current = openNoteSession(adapter, syncEnv, note.id);
    // Closing the editor mid-pause still saves what was typed.
    return () => {
      if (timer.current !== null) flushRef.current();
    };
  }, [adapter, note.id]);

  const change = (next: NoteDraft) => {
    const typeChanged = next.type !== latest.current.type;
    setDraft(next);
    latest.current = next;
    if (typeChanged) {
      void save({ type: next.type });
      return;
    }
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(flush, PAUSE_MS);
  };

  const confirmDelete = () =>
    Alert.alert('Delete this note?', 'It is removed from every device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          // A save after this would write to the deleted note.
          deleted.current = true;
          if (timer.current !== null) clearTimeout(timer.current);
          timer.current = null;
          deleteNote(adapter, syncEnv, note.id).then(
            () => router.back(),
            () => {
              deleted.current = false;
              toast.show('The note couldn’t be deleted. Try again.');
            },
          );
        },
      },
    ]);

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
    >
      <NoteForm draft={draft} onChange={change} onBlur={flush} />

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

      <PressableScale onPress={confirmDelete} accessibilityRole="button" style={styles.textButton}>
        <Text style={[type.callout, { color: colors.danger }]}>Delete note</Text>
      </PressableScale>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.xl },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: minTouchTarget,
  },
  textButton: { minHeight: minTouchTarget, justifyContent: 'center', alignSelf: 'flex-start' },
});

export default NoteScreen;
