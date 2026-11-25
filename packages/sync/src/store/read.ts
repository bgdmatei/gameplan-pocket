import { readSyncedRow } from '@gameplan/storage';
import type { NoteItem } from '@gameplan/domain';
import type { Transaction } from '@gameplan/storage';
import { fieldClocks } from '../merge/merge';
import { codecFor, parseClocks } from './entities';
import type { EntityValues, StoredEntity } from './entities';

/**
 * The clock of one field as this device holds it, or `null` when the row or
 * the clock doesn't exist.
 *
 * A note editor reads the text's clock when it opens and sends it as
 * `baseHlc` with every save of that session: the version the user started
 * from, which is what `notes-conflicts` (module 10) compares against.
 */
export const readFieldClock = async <E extends StoredEntity>(
  db: Transaction,
  entity: E,
  id: string,
  field: keyof EntityValues[E] & string,
): Promise<string | null> => {
  const stored = await readSyncedRow(db, codecFor(entity), id);
  if (stored === null) return null;
  return fieldClocks(parseClocks(stored.fieldHlc))[field] ?? null;
};

/**
 * A live note and its text's clock from one read of its row, so an editor
 * never pairs a text with a clock a pull wrote between two reads: its saves
 * would then look built on an edit it never showed. `null` when the note is
 * gone or deleted.
 */
export const readNoteForEditing = async (
  db: Transaction,
  id: string,
): Promise<{ note: NoteItem; textClock: string | null } | null> => {
  const stored = await readSyncedRow(db, codecFor('note_item'), id);
  if (stored === null || stored.deleted) return null;
  return {
    note: stored.value as NoteItem,
    textClock: fieldClocks(parseClocks(stored.fieldHlc)).text ?? null,
  };
};
