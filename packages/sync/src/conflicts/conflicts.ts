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
 * Neither edit was made on top of the other, so one text would be lost
 * (ADR-009). `held.baseHlc` is the row's `$base:text`. Two traps: "built on"
 * is an exact base match, as clock order waves a race through when the held
 * text ends a chain; and the node is never trusted, as an editor open across
 * a "keep both" races its own device's write. Callers skip this device's own
 * edits pulled back. An incoming edit with no base never races; a held text
 * with no base still can, or a race against it would lose a text.
 */
export const isConcurrentTextEdit = (incoming: TextEdit, held: TextEdit): boolean =>
  incoming.baseHlc !== undefined &&
  incoming.hlc !== held.hlc &&
  incoming.baseHlc !== held.hlc &&
  held.baseHlc !== incoming.hlc;

/** The same race spotted on two devices yields one id, so the copies merge as one row. */
const conflictId = (noteItemId: string, losingHlc: string): string =>
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
