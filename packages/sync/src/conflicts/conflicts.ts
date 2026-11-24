import type { NoteConflict } from '@gameplan/domain';
import { v5 } from 'uuid';
import { parseHlc } from '../clock/hlc';
import type { Op } from '../op/schema';

/**
 * Fixed namespace for conflict ids (ADR-009). Changing it gives the same race
 * a different id on newer apps, and one conflict becomes two rows: never
 * change it.
 */
const NOTE_CONFLICT_NAMESPACE = '0bd2d32f-e445-4a62-8af5-734b4dfa5661';

/** A note text edit: its clock, and the clock of the text it was written on top of. */
export type TextEdit = Pick<Extract<Op, { entity: 'note_item'; type: 'set' }>, 'hlc' | 'baseHlc'>;

/**
 * Neither edit was made on top of the other, so per-field LWW would lose one
 * text (ADR-009). `held` is the text this device has, its base read from
 * `$base:text`.
 *
 * "Built on" is an exact base match, never clock order: a held text at the end
 * of a chain has a base newer than an edit it raced. The cost is a rare extra
 * conflict for a text two steps back in a chain; a lost text is the worse one.
 *
 * Callers skip this device's own edits coming back in a pull: its first save,
 * pulled back after later ones, matches neither base. Two edits from one
 * device can still race (an editor open across a "keep both"), so the rule
 * itself never trusts the node.
 *
 * An incoming edit with no base is never concurrent: guessing would invent
 * conflicts. A held text with no base can still race the incoming edit.
 */
export const isConcurrentTextEdit = (incoming: TextEdit, held: TextEdit): boolean =>
  incoming.baseHlc !== undefined &&
  incoming.hlc !== held.hlc &&
  incoming.baseHlc !== held.hlc &&
  held.baseHlc !== incoming.hlc;

/** The same race spotted on two devices yields one id, so the copies merge as one row. */
export const conflictId = (noteItemId: string, losingHlc: string): string =>
  v5(`${noteItemId}\u0000${losingHlc}`, NOTE_CONFLICT_NAMESPACE);

/**
 * The conflict that keeps a losing text. Every field, `createdAt` included,
 * comes from the losing edit, and the conflict's op carries the losing clock:
 * every device that spots the race writes the same row at the same clock, so
 * a late copy changes nothing and can never reopen a resolved conflict.
 */
export const conflictFromLosingEdit = (
  noteItemId: string,
  losing: { text: string; hlc: string },
): NoteConflict => {
  const { nodeId, wallMs } = parseHlc(losing.hlc);
  return {
    id: conflictId(noteItemId, losing.hlc),
    noteItemId,
    text: losing.text,
    fromNodeId: nodeId,
    hlc: losing.hlc,
    createdAt: new Date(wallMs).toISOString(),
    resolved: false,
  };
};
