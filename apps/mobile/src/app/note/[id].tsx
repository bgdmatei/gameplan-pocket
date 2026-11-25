import { DomainValidationError } from '@gameplan/domain';
import type { ConflictChoice, NoteItem, NoteItemPatch } from '@gameplan/domain';
import {
  NOTE_CONFLICT_TABLES,
  NOTE_ITEM_TABLES,
  getNoteItem,
  getSyncState,
  listOpenConflicts,
} from '@gameplan/storage';
import { commitConflictResolution, isHlc, parseHlc, readFieldClock } from '@gameplan/sync';
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
import { conflictView } from '@/features/notes/conflict-view';
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

const draftOf = (note: NoteItem): NoteDraft => ({
  type: note.type,
  text: note.text,
  location: note.location ?? '',
});

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
  const [draft, setDraft] = useState<NoteDraft>(() => draftOf(note));
  // What the form last loaded. Unsaved changes are measured against it, not
  // the live note: a text pulled from another device updates the note but
  // never the form, and once made an untouched form look edited.
  const [loaded, setLoaded] = useState<NoteDraft>(() => draftOf(note));
  const reload = (fresh: NoteItem): void => {
    const next = draftOf(fresh);
    setDraft(next);
    setLoaded(next);
  };
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
  // Saving waits until the list is known: a save now would race a choice not
  // yet shown. A failed list doesn't lock the note.
  const blocked = conflicts.status === 'loading' || conflict !== undefined;
  // Which side is this device's own: known before the drawer shows, or it
  // would flash the stored sides first.
  // Read once: the node id never changes, and sync_state changes on every write.
  const syncState = useQuery((db) => getSyncState(db), [], []);
  const ownNodeId =
    syncState.status === 'ready'
      ? syncState.data.nodeId
      : // Unreadable: show the stored sides rather than lock the note.
        syncState.status === 'failed'
        ? null
        : undefined;
  // The text clock when this conflict was shown: what the choice is judged
  // against, so an edit arriving meanwhile becomes a conflict.
  const [shown, setShown] = useState<{ id: string; base: string | null } | null>(null);
  // Who wrote the text the note holds now, live: a pull can replace it while
  // the drawer is up.
  const textClock = useQuery(
    (db) => readFieldClock(db, 'note_item', note.id, 'text'),
    NOTE_ITEM_TABLES,
    [note.id],
  );
  const view =
    conflict === undefined || ownNodeId === undefined || textClock.status === 'loading'
      ? undefined
      : conflictView(
          {
            text: note.text,
            nodeId:
              textClock.status === 'ready' && textClock.data !== null && isHlc(textClock.data)
                ? parseHlc(textClock.data).nodeId
                : null,
          },
          conflict,
          ownNodeId,
        );
  // The form's text while a choice saves, so it doesn't flash the old draft
  // between the conflict closing and the reload.
  const [frozen, setFrozen] = useState<string | null>(null);
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
    if (view === undefined) return;
    inFlight.current = true;
    setChoosing(true);
    setFrozen(view.current);
    try {
      await commitConflictResolution(adapter, syncEnv, {
        conflictId: conflict.id,
        choice,
        baseHlc: shown.base,
      });
      const fresh = await getNoteItem(adapter, note.id);
      if (fresh !== null) {
        // Judged against what this device showed as its own: silent when the
        // other version added nothing to it.
        if (choice === 'keep_both' && fresh.text !== view.current) {
          toast.show('Notes merged.', 'success');
        }
        reload(fresh);
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
      setFrozen(null);
    }
  };

  const dirty =
    draft.type !== loaded.type || draft.text !== loaded.text || draft.location !== loaded.location;

  // A choice reloads the form, so changes typed before the conflict arrived ask first.
  const choose = (picked: ConflictChoice): void => {
    if (view === undefined) return;
    const choice = view.choice(picked);
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
    if (leaving || blocked) return;
    setLeaving(true);
    // Only the fields typed here: an untouched one would write back the value
    // loaded, over a newer one pulled from another device meanwhile.
    const patch: NoteItemPatch = {
      ...(draft.type !== loaded.type && { type: draft.type }),
      ...(draft.text !== loaded.text && { text: draft.text }),
      ...(draft.location !== loaded.location && { location: draft.location }),
    };
    if (!(await save(patch))) {
      setLeaving(false);
      return;
    }
    // A save that raced a text pulled while typing made a conflict: stay, so
    // the drawer opens now rather than on the next visit.
    try {
      if ((await listOpenConflicts(adapter, note.id)).length > 0) {
        const fresh = await getNoteItem(adapter, note.id);
        if (fresh !== null) {
          reload(fresh);
          setResolved(fresh.resolved);
        }
        // A fresh session: a later save builds on this one, not the old base.
        session.current = openNoteSession(adapter, syncEnv, note.id);
        setLeaving(false);
        return;
      }
    } catch {
      // The save went through; the badge still leads back to any conflict.
    }
    router.back();
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
                disabled: !dirty || blocked,
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
                  disabled={!dirty || blocked}
                  onPress={() => void saveDraft()}
                />
              </View>
            ),
          }}
        />
        <View pointerEvents={conflict === undefined ? 'auto' : 'none'} style={styles.form}>
          <NoteForm
            // This device's side of an open conflict, unless something is typed:
            // unsaved typing is never hidden.
            draft={
              frozen !== null
                ? { ...draft, text: frozen }
                : view !== undefined && !dirty
                  ? { ...draft, text: view.current }
                  : draft
            }
            onChange={setDraft}
          />

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
      {conflict === undefined || view === undefined ? null : (
        <ConflictDrawer
          other={view.other}
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
