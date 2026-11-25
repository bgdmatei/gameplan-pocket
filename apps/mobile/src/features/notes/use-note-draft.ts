import { DomainValidationError } from '@gameplan/domain';
import type { NoteItem, NoteItemPatch } from '@gameplan/domain';
import { useEffect, useRef, useState } from 'react';
import { useDatabase } from '@/data/database';
import { syncEnv } from '@/data/env';
import { useToast } from '@/ui/components/toast';
import type { NoteDraft } from './note-form';
import { openNoteSession, reopenNote } from './note-session';
import type { NoteSession } from './note-session';

const draftOf = (note: NoteItem): NoteDraft => ({
  type: note.type,
  text: note.text,
  location: note.location ?? '',
});

export type NoteDraftState = {
  draft: NoteDraft;
  setDraft: (draft: NoteDraft) => void;
  /** Something typed differs from what the form last loaded. */
  dirty: boolean;
  /** Only the fields typed here, so an untouched one never overwrites a newer pulled value. */
  typedChanges: () => NoteItemPatch;
  resolved: boolean;
  setResolved: (resolved: boolean) => void;
  /** Resolves `false` when the change was refused or failed, after saying so. */
  save: (patch: NoteItemPatch) => Promise<boolean>;
  /** The text the form is locked on while a reload lands, or `null`. */
  frozenText: string | null;
  /** Locks the form on `text`; only the latest freeze's token reloads or unfreezes. */
  freeze: (text: string) => number;
  unfreeze: (token: number) => void;
  /** Reloads the form for `token`, saying so when it fails: `null` when the note is gone or unread. */
  tryRefresh: (token: number) => Promise<NoteItem | null>;
  /** Freezes on `text` and reloads: `null` when the note is gone or unread. */
  refreshFrozen: (text: string) => Promise<NoteItem | null>;
};

/**
 * The note form's state in one editor sitting (see `openNoteSession`). Type,
 * text and location are a draft until saved. A refresh from the database
 * never overwrites the draft; only a reload, asked for by the screen, does.
 */
export const useNoteDraft = (note: NoteItem): NoteDraftState => {
  const adapter = useDatabase();
  const toast = useToast();
  const [draft, setDraft] = useState<NoteDraft>(() => draftOf(note));
  // What the form last loaded. Unsaved changes are measured against it, not
  // the live note: a text pulled from another device updates the note but
  // never the form, and once made an untouched form look edited.
  const [loaded, setLoaded] = useState<NoteDraft>(() => draftOf(note));
  const [resolved, setResolved] = useState(note.resolved);
  const session = useRef<Promise<NoteSession> | null>(null);
  const [frozenText, setFrozenText] = useState<string | null>(null);
  const freezeToken = useRef(0);
  // Whether the screen is still there for a reload.
  const mounted = useRef(true);

  useEffect(() => {
    session.current = openNoteSession(adapter, syncEnv, note.id);
  }, [adapter, note.id]);

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
    const next = draftOf(fresh.note);
    setDraft(next);
    setLoaded(next);
    setResolved(fresh.note.resolved);
    session.current = Promise.resolve(fresh.session);
    return fresh.note;
  };

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
    setFrozenText(text);
    return freezeToken.current;
  };

  const unfreeze = (token: number): void => {
    if (mounted.current && token === freezeToken.current) setFrozenText(null);
  };

  const refreshFrozen = async (text: string): Promise<NoteItem | null> => {
    const token = freeze(text);
    try {
      return await tryRefresh(token);
    } finally {
      unfreeze(token);
    }
  };

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

  const dirty =
    draft.type !== loaded.type || draft.text !== loaded.text || draft.location !== loaded.location;

  const typedChanges = (): NoteItemPatch => ({
    ...(draft.type !== loaded.type && { type: draft.type }),
    ...(draft.text !== loaded.text && { text: draft.text }),
    ...(draft.location !== loaded.location && { location: draft.location }),
  });

  return {
    draft,
    setDraft,
    dirty,
    typedChanges,
    resolved,
    setResolved,
    save,
    frozenText,
    freeze,
    unfreeze,
    tryRefresh,
    refreshFrozen,
  };
};
