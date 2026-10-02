import { applyNoteItemChange, createNoteItem } from '@gameplan/domain';
import type { NoteItemPatch, NoteItemType } from '@gameplan/domain';
import type { StorageAdapter } from '@gameplan/storage';
import {
  commitLocalCreate,
  commitLocalDelete,
  commitLocalEdit,
  newId,
  readFieldClock,
} from '@gameplan/sync';
import type { SyncEnv } from '@gameplan/sync';

/*
 * Note text and location are the user's private writing (CLAUDE.md §Privacy):
 * nothing here logs, and errors carry domain reasons, never the values.
 */

export type NewNote = {
  entryId: string;
  type: NoteItemType;
  text: string;
  location?: string | null;
};

/** @throws {DomainValidationError} when the note is unusable, writing nothing. */
export const createNote = async (
  adapter: StorageAdapter,
  env: SyncEnv,
  note: NewNote,
): Promise<string> => {
  const nowMs = env.now();
  const next = createNoteItem({
    ...note,
    id: newId(env.randomBytes, nowMs),
    createdAt: new Date(nowMs).toISOString(),
  });
  await commitLocalCreate(adapter, env, { entity: 'note_item', next });
  return next.id;
};

export const deleteNote = async (adapter: StorageAdapter, env: SyncEnv, id: string) =>
  commitLocalDelete(adapter, env, { entity: 'note_item', entityId: id });

export type NoteSession = {
  /**
   * Saves one edit. Resolves `false` when nothing changed, so no op is sent.
   *
   * @throws {DomainValidationError} writing nothing.
   */
  save: (patch: NoteItemPatch) => Promise<boolean>;
};

/**
 * One sitting in the note editor. The text's clock is read once, when the
 * editor opens, and every text save of the session carries it as `baseHlc`:
 * the version the user started from. Re-reading it after each save would make
 * a later save look based on the session's own earlier one, and hide an edit
 * made meanwhile on another device (ADR-009).
 */
export const openNoteSession = async (
  adapter: StorageAdapter,
  env: SyncEnv,
  id: string,
): Promise<NoteSession> => {
  const baseHlc = await readFieldClock(adapter, 'note_item', id, 'text');

  return {
    save: async (patch) => {
      const op = await commitLocalEdit(adapter, env, {
        entity: 'note_item',
        id,
        update: (current) => {
          const change = applyNoteItemChange(current, patch);
          const textChanged = change.changed.text !== undefined;
          return textChanged && baseHlc !== null ? { ...change, baseHlc } : change;
        },
      });
      return op !== null;
    },
  };
};
