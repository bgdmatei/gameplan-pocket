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
import { deleteNote, openNoteSession, reopenNote } from '@/features/notes/note-session';
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
 * the draft, except an untouched, locked one when a conflict closes (ADR-009).
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
  // The conflict this screen last saw, and the one a choice here closed.
  const previousConflict = useRef<string | undefined>(undefined);
  const chosenHere = useRef<string | null>(null);
  // Saving waits until the list is known: a save now would race a choice not
  // yet shown. A failed list doesn't lock the note: a save that races then
  // keeps the other text as a conflict, so nothing is lost.
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
  // The form's text, locked, from a conflict closing until the reload lands,
  // so nothing flashes and nothing typed meanwhile is overwritten. Each
  // freeze takes a token; only the latest reloads or unfreezes.
  const [frozen, setFrozen] = useState<string | null>(null);
  const freezeToken = useRef(0);
  // The text the form showed in the last committed render, for the freeze
  // when a conflict closes elsewhere. Updated by an effect declared after the
  // close effect, so that one still reads the previous render's text.
  const displayed = useRef<string>(draft.text);
  // Whether the screen is still there for a reload.
  const mounted = useRef(true);
  useEffect(() => {
    // Set here too: StrictMode runs effects twice in development.
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /**
   * The note as stored and a session on exactly that text, from one read: a
   * pull between two reads would pair a text with a newer clock, and a later
   * save would look built on an edit the form never showed.
   */
  const refresh = async (token: number): Promise<NoteItem | null> => {
    const fresh = await reopenNote(adapter, syncEnv, note.id);
    if (fresh === null || !mounted.current || token !== freezeToken.current) return null;
    reload(fresh.note);
    setResolved(fresh.note.resolved);
    session.current = Promise.resolve(fresh.session);
    return fresh.note;
  };
  /** `refresh`, saying so when it fails: `null` when the note is gone or unread. */
  const tryRefresh = async (token: number): Promise<NoteItem | null> => {
    try {
      return await refresh(token);
    } catch {
      if (mounted.current) toast.show('This note couldn’t be refreshed. Open it again.', 'problem');
      return null;
    }
  };
  const freeze = (text: string): number => {
    freezeToken.current += 1;
    setFrozen(text);
    return freezeToken.current;
  };
  const unfreeze = (token: number): void => {
    if (mounted.current && token === freezeToken.current) setFrozen(null);
  };
  /** Freezes on `text` and reloads: `null` when the note is gone or unread. */
  const refreshFrozen = async (text: string): Promise<NoteItem | null> => {
    const token = freeze(text);
    try {
      return await tryRefresh(token);
    } finally {
      unfreeze(token);
    }
  };
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
    const chosen = conflict.id;
    chosenHere.current = chosen;
    setChoosing(true);
    const token = freeze(view.current);
    try {
      try {
        await commitConflictResolution(adapter, syncEnv, {
          conflictId: chosen,
          choice,
          baseHlc: shown.base,
        });
      } catch (error) {
        chosenHere.current = null;
        // Closed on another device meanwhile: nothing to try again, and the
        // close was skipped as chosen here, so reload now.
        if (previousConflict.current !== chosen) {
          await tryRefresh(token);
          return;
        }
        toast.show(
          error instanceof DomainValidationError
            ? 'Too long to join: keep one version, or shorten first.'
            : 'The choice couldn’t be saved. Try again.',
          'problem',
        );
        return;
      }
      const fresh = await tryRefresh(token);
      // Judged against what this device showed as its own: silent when the
      // other version added nothing to it.
      if (choice === 'keep_both' && fresh !== null && fresh.text !== view.current) {
        toast.show('Notes merged.', 'success');
      }
    } finally {
      inFlight.current = false;
      setChoosing(false);
      unfreeze(token);
    }
  };

  const dirty =
    draft.type !== loaded.type || draft.text !== loaded.text || draft.location !== loaded.location;

  // A conflict that closes without a choice made here (resolved on another
  // device) leaves the form showing the text it loaded, not the resolution.
  // The form was locked while it was open, so an untouched one takes the
  // note's text and a fresh session; typing is still never replaced.
  useEffect(() => {
    if (conflicts.status !== 'ready') return;
    const before = previousConflict.current;
    previousConflict.current = conflict?.id;
    if (before === undefined || before === conflict?.id || before === chosenHere.current) return;
    if (dirty) return;
    void refreshFrozen(displayed.current);
  }, [conflicts.status, conflict?.id]);

  // This device's side of an open conflict unless something is typed (typing is
  // never hidden), or the frozen text while a reload lands.
  const formText = frozen ?? (view !== undefined && !dirty ? view.current : draft.text);
  useEffect(() => {
    displayed.current = formText;
  });

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
        // A fresh session: a later save builds on this one, not the old base.
        // A note gone meanwhile has nothing to stay for.
        if ((await refreshFrozen(draft.text)) === null) {
          router.back();
          return;
        }
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
        <View pointerEvents={!blocked && frozen === null ? 'auto' : 'none'} style={styles.form}>
          <NoteForm draft={{ ...draft, text: formText }} onChange={setDraft} />

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
