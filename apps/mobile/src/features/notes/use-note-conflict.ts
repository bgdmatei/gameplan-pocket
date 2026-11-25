import { DomainValidationError } from '@gameplan/domain';
import type { ConflictChoice, NoteConflict, NoteItem } from '@gameplan/domain';
import {
  NOTE_CONFLICT_TABLES,
  NOTE_ITEM_TABLES,
  getSyncState,
  listOpenConflicts,
} from '@gameplan/storage';
import { commitConflictResolution, isHlc, parseHlc, readFieldClock } from '@gameplan/sync';
import { useEffect, useRef, useState } from 'react';
import { Alert, Keyboard } from 'react-native';
import { useDatabase } from '@/data/database';
import { syncEnv } from '@/data/env';
import { useQuery } from '@/data/use-query';
import { useToast } from '@/ui/components/toast';
import { conflictView } from './conflict-view';
import type { ConflictView } from './conflict-view';
import type { NoteDraftState } from './use-note-draft';

/** What each button says it did, named by the button, not the stored choice. */
const CHOSEN_TOAST: Record<ConflictChoice, string> = {
  keep_current: 'Current changes saved.',
  keep_other: 'Incoming changes saved.',
  keep_both: 'Notes merged.',
};

export type NoteConflictState = {
  /** The oldest open conflict on the note, shown first; the next follows each choice. */
  conflict: NoteConflict | undefined;
  /** `conflict` from this device's side; `undefined` until that is known. */
  view: ConflictView | undefined;
  /** Saving waits: the conflict list is unknown, or a choice is waiting. */
  blocked: boolean;
  /** The drawer's choices can be pressed. */
  ready: boolean;
  /** A drawer button pressed, named as the button reads on this device. */
  choose: (picked: ConflictChoice) => void;
  /** The text the form shows: the frozen text, this device's side, or the draft. */
  formText: string;
};

/**
 * The open conflicts on one note, as the note editor shows and resolves
 * them. The form is locked while one is open, so after a choice, or a close
 * on another device, it reloads (`useNoteDraft`): a later save is then built
 * on the resolution, not racing it. Typing is never replaced.
 */
export const useNoteConflict = (note: NoteItem, form: NoteDraftState): NoteConflictState => {
  const adapter = useDatabase();
  const toast = useToast();

  const conflicts = useQuery((db) => listOpenConflicts(db, note.id), NOTE_CONFLICT_TABLES, [
    note.id,
  ]);
  const conflict = conflicts.status === 'ready' ? conflicts.data[0] : undefined;
  // The conflict this screen last saw, and the one a choice here closed.
  const previousConflict = useRef<string | undefined>(undefined);
  const chosenHere = useRef<string | null>(null);
  // A save now would race a choice not yet shown. A failed list doesn't lock
  // the note: a save that races then keeps the other text as a conflict.
  const blocked = conflicts.status === 'loading' || conflict !== undefined;

  // Which side is this device's own: known before the drawer shows, or it
  // would flash the stored sides first. Read once: the node id never
  // changes, and sync_state changes on every write.
  const syncState = useQuery((db) => getSyncState(db), [], []);
  const ownNodeId =
    syncState.status === 'ready'
      ? syncState.data.nodeId
      : // Unreadable: show the stored sides rather than lock the note.
        syncState.status === 'failed'
        ? null
        : undefined;
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

  // The note's text clock when the drawer opened on this conflict: what the
  // choice is judged against, so an edit arriving meanwhile becomes a conflict.
  const [drawerBase, setDrawerBase] = useState<{
    conflictId: string;
    textClock: string | null;
  } | null>(null);
  const [choosing, setChoosing] = useState(false);
  // Set before the re-render that disables the buttons, so a double tap runs once.
  const inFlight = useRef(false);
  // The text the form showed in the last committed render, for the freeze
  // when a conflict closes elsewhere. Updated by an effect declared after the
  // close effect, so that one still reads the previous render's text.
  const displayedText = useRef<string>(form.draft.text);

  useEffect(() => {
    if (conflict === undefined) return;
    // The keyboard would cover the drawer's choices.
    Keyboard.dismiss();
    let current = true;
    readFieldClock(adapter, 'note_item', note.id, 'text').then(
      (base) => {
        if (current) setDrawerBase({ conflictId: conflict.id, textClock: base });
      },
      () => {
        if (current) toast.show('This conflict couldn’t be read. Open the note again.', 'problem');
      },
    );
    return () => {
      current = false;
    };
  }, [adapter, note.id, conflict?.id]);

  const resolve = async (picked: ConflictChoice): Promise<void> => {
    if (conflict === undefined || view === undefined || inFlight.current) return;
    if (drawerBase?.conflictId !== conflict.id) return;
    inFlight.current = true;
    const chosen = conflict.id;
    chosenHere.current = chosen;
    setChoosing(true);
    const token = form.freeze(view.current);
    try {
      try {
        await commitConflictResolution(adapter, syncEnv, {
          conflictId: chosen,
          choice: view.choice(picked),
          baseHlc: drawerBase.textClock,
        });
      } catch (error) {
        chosenHere.current = null;
        // Closed on another device meanwhile: nothing to try again, and the
        // close was skipped as chosen here, so reload now.
        if (previousConflict.current !== chosen) {
          await form.tryRefresh(token);
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
      if ((await form.tryRefresh(token)) !== null) toast.show(CHOSEN_TOAST[picked], 'success');
    } finally {
      inFlight.current = false;
      setChoosing(false);
      form.unfreeze(token);
    }
  };

  // A conflict that closes without a choice made here (resolved on another
  // device) leaves the form showing the text it loaded, not the resolution.
  // The form was locked while it was open, so an untouched one reloads.
  useEffect(() => {
    if (conflicts.status !== 'ready') return;
    const before = previousConflict.current;
    previousConflict.current = conflict?.id;
    if (before === undefined || before === conflict?.id || before === chosenHere.current) return;
    if (form.dirty) return;
    void form.refreshFrozen(displayedText.current);
  }, [conflicts.status, conflict?.id]);

  // Typing is never hidden, so a dirty form shows its draft.
  const formText =
    form.frozenText ?? (view !== undefined && !form.dirty ? view.current : form.draft.text);
  useEffect(() => {
    displayedText.current = formText;
  });

  // A choice reloads the form, so changes typed before the conflict arrived ask first.
  const choose = (picked: ConflictChoice): void => {
    if (!form.dirty) {
      void resolve(picked);
      return;
    }
    Alert.alert('Discard your changes?', 'What you changed isn’t saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => void resolve(picked) },
    ]);
  };

  return {
    conflict,
    view,
    blocked,
    ready: conflict !== undefined && drawerBase?.conflictId === conflict.id && !choosing,
    choose,
    formText,
  };
};
