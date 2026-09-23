import { noteItemSchema } from '@gameplan/domain';
import type { NoteItem, NoteItemType } from '@gameplan/domain';
import type { SqlValue, StorageAdapter } from '../adapter';
import { writeAtomically } from './write';
import type { PendingOp, Row } from './write';

export const NOTE_ITEM_TABLES = ['note_items'] as const;

export type NoteSaveOptions = {
  updatedAt: string;
  fieldHlc?: string;
  op?: PendingOp;
};

export type ListNoteOptions = {
  type?: NoteItemType;
  /** `false` lists what is still open, which is the notes screen's default. */
  resolved?: boolean;
};

export const toRow = (item: NoteItem, { updatedAt, fieldHlc }: NoteSaveOptions): Row => ({
  id: item.id,
  entry_id: item.entryId,
  type: item.type,
  text: item.text,
  location: item.location,
  resolved: item.resolved,
  created_at: item.createdAt,
  updated_at: updatedAt,
  field_hlc: fieldHlc ?? '{}',
});

export type NoteRow = {
  id: string;
  entry_id: string;
  type: string;
  text: string;
  location: string | null;
  resolved: number;
  created_at: string;
};

export const toNote = (row: NoteRow): NoteItem =>
  noteItemSchema.parse({
    id: row.id,
    entryId: row.entry_id,
    type: row.type,
    text: row.text,
    location: row.location,
    resolved: row.resolved === 1,
    createdAt: row.created_at,
  });

/**
 * A game's notes in reading order: by location, then oldest first, with notes
 * that have no location last.
 *
 * The ordering is done in SQL and mirrors the domain's `compareNoteItems`, so
 * a list rendered from the database reads the same as one sorted in memory.
 * A test asserts the two agree.
 */
export const listNoteItems = async (
  adapter: StorageAdapter,
  entryId: string,
  options: ListNoteOptions = {},
): Promise<NoteItem[]> => {
  const conditions = ['entry_id = ?', 'deleted = 0'];
  const params: SqlValue[] = [entryId];

  if (options.type !== undefined) {
    conditions.push('type = ?');
    params.push(options.type);
  }
  if (options.resolved !== undefined) {
    conditions.push('resolved = ?');
    params.push(options.resolved);
  }

  const rows = await adapter.execute<NoteRow>(
    `SELECT id, entry_id, type, text, location, resolved, created_at
     FROM note_items
     WHERE ${conditions.join(' AND ')}
     ORDER BY location IS NULL, location, created_at`,
    params,
  );

  return rows.map(toNote);
};

export const getNoteItem = async (
  adapter: StorageAdapter,
  id: string,
): Promise<NoteItem | null> => {
  const rows = await adapter.execute<NoteRow>(
    'SELECT * FROM note_items WHERE id = ? AND deleted = 0',
    [id],
  );
  const row = rows[0];
  return row === undefined ? null : toNote(row);
};

/** Counts what is still unresolved per game, for a badge on the library grid. */
export const countOpenNotes = async (adapter: StorageAdapter, entryId: string): Promise<number> => {
  const rows = await adapter.execute<{ count: number }>(
    'SELECT COUNT(*) AS count FROM note_items WHERE entry_id = ? AND resolved = 0 AND deleted = 0',
    [entryId],
  );
  return rows[0]?.count ?? 0;
};

export const saveNoteItem = async (
  adapter: StorageAdapter,
  item: NoteItem,
  options: NoteSaveOptions,
): Promise<void> => {
  await writeAtomically(adapter, {
    rows: [{ table: 'note_items', row: toRow(item, options) }],
    ...(options.op === undefined ? {} : { ops: [options.op] }),
  });
};

export const softDeleteNoteItem = async (
  adapter: StorageAdapter,
  id: string,
  options: NoteSaveOptions,
): Promise<void> => {
  await adapter.transaction(async (tx) => {
    await tx.execute('UPDATE note_items SET deleted = 1, updated_at = ? WHERE id = ?', [
      options.updatedAt,
      id,
    ]);

    if (options.op !== undefined) {
      await tx.execute('INSERT INTO pending_ops (id, payload, created_at) VALUES (?, ?, ?)', [
        options.op.id,
        options.op.payload,
        options.op.createdAt,
      ]);
    }
  });
};
