import { z } from 'zod';
import { applyNoteItemChange } from '../note-item/changes';
import type { NoteItemChange } from '../note-item/changes';
import type { NoteItem } from '../note-item/schema';
import { mergeLines } from './merge-lines';
import type { NoteConflict } from './schema';

export const conflictChoiceSchema = z.enum(['keep_current', 'keep_other', 'keep_both']);

export type ConflictChoice = z.infer<typeof conflictChoiceSchema>;

/** The note text change a choice makes, if any, and the conflict marked resolved. */
export type ConflictResolution = {
  note: NoteItemChange | undefined;
  conflict: { next: NoteConflict; changed: Partial<NoteConflict> };
};

/**
 * The user's choice for one conflict. Keep current leaves the note
 * alone; keep other makes the conflict's text the note's; keep both merges
 * the two by line (`mergeLines`), and changes nothing when the other version
 * holds no line the note lacks, in any order.
 *
 * A conflict already resolved (a second tap, or another device first)
 * changes nothing: applying the choice again would join its text twice.
 *
 * @throws {DomainValidationError} when the merged text would pass the note
 * limit: nothing changes, and the user keeps one version or shortens first.
 */
export const resolveConflict = (
  note: NoteItem,
  conflict: NoteConflict,
  choice: ConflictChoice,
): ConflictResolution => {
  if (conflict.resolved) return { note: undefined, conflict: { next: conflict, changed: {} } };
  // A switch, not a lookup object: the merge runs only for keep both.
  const text = ((): string | undefined => {
    switch (choice) {
      case 'keep_current':
        return undefined;
      case 'keep_other':
        return conflict.text;
      case 'keep_both':
        return mergeLines(note.text, conflict.text);
    }
  })();
  const change = text === undefined ? undefined : applyNoteItemChange(note, { text });

  return {
    note: change === undefined || Object.keys(change.changed).length === 0 ? undefined : change,
    conflict: {
      next: { ...conflict, resolved: true },
      changed: { resolved: true },
    },
  };
};
