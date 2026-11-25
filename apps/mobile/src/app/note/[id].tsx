import { DomainValidationError } from '@gameplan/domain';
import type { ConflictChoice, NoteItem, NoteItemPatch } from '@gameplan/domain';
import {
  NOTE_CONFLICT_TABLES,
  NOTE_ITEM_TABLES,
  getNoteItem,
  listOpenConflicts,
} from '@gameplan/storage';
import { commitConflictResolution, readFieldClock } from '@gameplan/sync';
import { Stack, router, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, StyleSheet, Switch, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '@/data/database';
import { syncEnv } from '@/data/env';
import { useQuery } from '@/data/use-query';
import { ConflictDrawer, conflictDrawerSpace } from '@/features/notes/conflict-drawer';
import { NoteForm } from '@/features/notes/note-form';
import type { NoteDraft } from '@/features/notes/note-form';
import { deleteNote, openNoteSession } from '@/features/notes/note-session';
import type { NoteSession } from '@/features/notes/note-session';
import { HeaderIconButton } from '@/ui/components/header-button';
import { LoadFailed } from '@/ui/components/load-failed';
import { useToast } from '@/ui/components/toast';
import { minTouchTarget, radius, space, type } from '@/ui/theme';
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

  // Oldest first, one at a time: the next follows each choice.
  const conflicts = useQuery((db) => listOpenConflicts(db, note.id), NOTE_CONFLICT_TABLES, [
    note.id,
  ]);
  const conflict = conflicts.status === 'ready' ? conflicts.data[0] : undefined;
  // The text clock when this conflict was shown: what the choice is judged
  // against, so an edit arriving meanwhile becomes a conflict.
  const [shown, setShown] = useState<{ id: string; base: string | null } | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [drawerHeight, setDrawerHeight] = useState(0);
  // Set before the re-render that disables the pills, so a double tap runs once.
  const inFlight = useRef(false);

  useEffect(() => {
    if (conflict === undefined) return;
    // The keyboard would cover the drawer's choices.
    Keyboard.dismiss();
    let current = true;
    readFieldClock(adapter, 'note_item', note.id, 'text').then(
      (base) => {
        if (current) setShown({ id: conflict.id, base });
      },
      () => {
        if (current) toast.show('This conflict couldn’t be read. Open the note again.', 'problem');
      },
    );
    return () => {
      current = false;
    };
  }, [adapter, note.id, conflict?.id]);

  /**
   * The form is closed while a conflict is open, so after a choice it takes
   * the note's new text and a fresh session: a later save is then built on
   * the resolution, not racing it.
   */
  const resolve = async (choice: ConflictChoice): Promise<void> => {
    if (conflict === undefined || shown?.id !== conflict.id || inFlight.current) return;
    inFlight.current = true;
    setChoosing(true);
    try {
      const ops = await commitConflictResolution(adapter, syncEnv, {
        conflictId: conflict.id,
        choice,
        baseHlc: shown.base,
      });
      // Silent when the other version held nothing new: the note didn't change.
      if (choice === 'keep_both' && ops.some((op) => op.entity === 'note_item')) {
        toast.show('Notes merged.', 'success');
      }
      const fresh = await getNoteItem(adapter, note.id);
      if (fresh !== null) {
        setDraft({ type: fresh.type, text: fresh.text, location: fresh.location ?? '' });
        setResolved(fresh.resolved);
      }
      session.current = openNoteSession(adapter, syncEnv, note.id);
    } catch (error) {
      toast.show(
        error instanceof DomainValidationError
          ? 'Too long to join: keep one version, or shorten first.'
          : 'The choice couldn’t be saved. Try again.',
        'problem',
      );
    } finally {
      inFlight.current = false;
      setChoosing(false);
    }
  };

  const dirty =
    draft.type !== note.type ||
    draft.text !== note.text ||
    draft.location !== (note.location ?? '');

  // A choice reloads the form, so changes typed before the conflict arrived ask first.
  const choose = (choice: ConflictChoice): void => {
    if (!dirty) {
      void resolve(choice);
      return;
    }
    Alert.alert('Discard your changes?', 'What you changed isn’t saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => void resolve(choice) },
    ]);
  };

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
    // A save now would race the choice still waiting below.
    if (leaving || conflict !== undefined) return;
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

  // Room to scroll the whole note above the drawer while it is up.
  const below =
    conflict === undefined ? insets.bottom : conflictDrawerSpace(drawerHeight, insets.bottom);

  return (
    <View style={styles.screen}>
      <KeyboardAwareScrollView
        contentContainerStyle={[styles.page, { paddingBottom: space.xl + below }]}
        bottomOffset={space.lg}
        disableScrollOnKeyboardHide
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
                tintColor: colors.success,
                sharesBackground: false,
                disabled: !dirty || conflict !== undefined,
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
                  success
                  disabled={!dirty || conflict !== undefined}
                  onPress={() => void saveDraft()}
                />
              </View>
            ),
          }}
        />
        <View pointerEvents={conflict === undefined ? 'auto' : 'none'} style={styles.form}>
          <NoteForm draft={draft} onChange={setDraft} />

          <View
            style={[
              styles.switchRow,
              { backgroundColor: colors.surface, borderColor: colors.line },
            ]}
          >
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
        </View>
      </KeyboardAwareScrollView>
      {conflict === undefined ? null : (
        <ConflictDrawer
          conflict={conflict}
          ready={shown?.id === conflict.id && !choosing}
          onChoose={choose}
          onHeight={setDrawerHeight}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: { padding: space.lg, gap: space.xl },
  form: { gap: space.xl },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  // A soft card row, like Favourite on the game.
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: minTouchTarget,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

export default NoteScreen;
