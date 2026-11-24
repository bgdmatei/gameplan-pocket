import { noteConflictSchema } from '@gameplan/domain';
import type { NoteConflict } from '@gameplan/domain';
import type { StorageAdapter } from '../adapter';
import type { Row } from './write';

/** A conflict shows only while its note and game are live, and either can land after it on a pull. */
export const NOTE_CONFLICT_TABLES = ['note_conflicts', 'note_items', 'library_entries'] as const;

export const toRow = (conflict: NoteConflict, fieldHlc: string): Row => ({
  id: conflict.id,
  note_item_id: conflict.noteItemId,
  text: conflict.text,
  from_node_id: conflict.fromNodeId,
  hlc: conflict.hlc,
  created_at: conflict.createdAt,
  resolved: conflict.resolved,
  field_hlc: fieldHlc,
});

export type NoteConflictRow = {
  id: string;
  note_item_id: string;
  text: string;
  from_node_id: string;
  hlc: string;
  created_at: string;
  resolved: number;
};

export const toConflict = (row: NoteConflictRow): NoteConflict =>
  noteConflictSchema.parse({
    id: row.id,
    noteItemId: row.note_item_id,
    text: row.text,
    fromNodeId: row.from_node_id,
    hlc: row.hlc,
    createdAt: row.created_at,
    resolved: row.resolved === 1,
  });

// Open conflicts: unresolved, on a note and game this device holds and hasn't deleted.
const OPEN_CONFLICTS = `note_conflicts c
  JOIN note_items n ON n.id = c.note_item_id
  JOIN library_entries e ON e.id = n.entry_id
  WHERE c.resolved = 0 AND c.deleted = 0 AND n.deleted = 0 AND e.deleted = 0`;

/** A note's unresolved conflicts, oldest first: the order the user resolves them in. */
export const listOpenConflicts = async (
  adapter: StorageAdapter,
  noteItemId: string,
): Promise<NoteConflict[]> => {
  const rows = await adapter.execute<NoteConflictRow>(
    `SELECT c.id, c.note_item_id, c.text, c.from_node_id, c.hlc, c.created_at, c.resolved
     FROM ${OPEN_CONFLICTS} AND c.note_item_id = ?
     ORDER BY c.created_at, c.id`,
    [noteItemId],
  );
  return rows.map(toConflict);
};

/** Games with at least one unresolved conflict on a live note, for the library cover marker. */
export const listGamesWithOpenConflicts = async (adapter: StorageAdapter): Promise<number[]> => {
  const rows = await adapter.execute<{ game_id: number }>(
    `SELECT DISTINCT e.game_id
     FROM ${OPEN_CONFLICTS}
     ORDER BY e.game_id`,
  );
  return rows.map((row) => row.game_id);
};
