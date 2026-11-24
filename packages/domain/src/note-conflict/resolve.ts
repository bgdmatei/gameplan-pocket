import { z } from 'zod';
import { applyNoteItemChange } from '../note-item/changes';
import type { NoteItemChange } from '../note-item/changes';
import type { NoteItem } from '../note-item/schema';
import type { NoteConflict } from './schema';

export const conflictChoiceSchema = z.enum(['keep_current', 'keep_other', 'keep_both']);

export type ConflictChoice = z.infer<typeof conflictChoiceSchema>;

/** The note text change a choice makes, if any, and the conflict marked resolved. */
export type ConflictResolution = {
  note: NoteItemChange | undefined;
  conflict: { next: NoteConflict; changed: Partial<NoteConflict> };
};

/**
 * The user's choice for one conflict (ADR-009). Keep current leaves the note
 * alone; keep other makes the conflict's text the note's; keep both joins the
 * two with a blank line, current first.
 *
 * A conflict already resolved (a second tap, or another device first)
 * changes nothing: applying the choice again would join its text twice.
 *
 * @throws {DomainValidationError} when the joined text would pass the note
 * limit: nothing changes, and the user keeps one version or shortens first.
 */
export const resolveConflict = (
  note: NoteItem,
  conflict: NoteConflict,
  choice: ConflictChoice,
): ConflictResolution => {
  if (conflict.resolved) return { note: undefined, conflict: { next: conflict, changed: {} } };
  const text = {
    keep_current: undefined,
    keep_other: conflict.text,
    keep_both: `${note.text}\n\n${conflict.text}`,
  }[choice];
  const change = text === undefined ? undefined : applyNoteItemChange(note, { text });

  return {
    note: change === undefined || Object.keys(change.changed).length === 0 ? undefined : change,
    conflict: {
      next: { ...conflict, resolved: true },
      changed: { resolved: true },
    },
  };
};
