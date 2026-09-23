import type { EntryTag, LibraryEntry, List, ListItem, NoteItem } from '@gameplan/domain';
import type { SqlValue, Transaction } from '../adapter';
import { toTag, toRow as tagToRow } from './entry-tags';
import type { TagRow } from './entry-tags';
import { toRow as entryToRow, toEntry } from './library-entries';
import type { EntryRow } from './library-entries';
import { toList, toListItem, toListItemRow, toListRow } from './lists';
import type { ListItemRow, ListRow } from './lists';
import { toRow as noteToRow, toNote } from './note-items';
import type { NoteRow } from './note-items';
import type { Row } from './write';

/** The sync bookkeeping written alongside a row's domain fields. */
export type RowMeta = {
  /** Per-field clocks as JSON, owned by `sync-core`. */
  fieldHlc: string;
  deleted: boolean;
  /** Local bookkeeping time (`updated_at` and the like); never synced. */
  now: string;
};

/** A row as `sync-core` sees it: the domain value plus its bookkeeping. */
export type StoredRow<T> = { value: T; fieldHlc: string; deleted: boolean };

export type SyncedRowCodec<T> = {
  table: string;
  toRow: (value: T, meta: RowMeta) => Row;
  fromRow: (row: Readonly<Record<string, SqlValue>>) => T;
};

const codec = <T, R>(
  table: string,
  toRow: (value: T, meta: RowMeta) => Row,
  fromRow: (row: R) => T,
): SyncedRowCodec<T> => ({ table, toRow, fromRow: (row) => fromRow(row as R) });

/**
 * How each synced table maps to its domain type, for `sync-core`.
 *
 * Built from the repositories' own mappers, so the column mapping still lives
 * in one place per entity: a column added to a repository reaches sync too.
 * `note_conflicts` has no repository yet; `notes-conflicts` (module 10) adds it.
 */
export const SYNCED_ROWS = {
  library_entries: codec<LibraryEntry, EntryRow>(
    'library_entries',
    (entry, { fieldHlc, deleted, now }) => ({
      ...entryToRow(entry, { updatedAt: now, fieldHlc }),
      deleted,
    }),
    toEntry,
  ),
  entry_tags: codec<EntryTag, TagRow>(
    'entry_tags',
    (tag, { fieldHlc, deleted, now }) => ({
      ...tagToRow(tag, { createdAt: now, fieldHlc }),
      deleted,
    }),
    toTag,
  ),
  note_items: codec<NoteItem, NoteRow>(
    'note_items',
    (item, { fieldHlc, deleted, now }) => ({
      ...noteToRow(item, { updatedAt: now, fieldHlc }),
      deleted,
    }),
    toNote,
  ),
  lists: codec<List, ListRow>(
    'lists',
    (list, { fieldHlc, deleted, now }) => ({
      ...toListRow(list, { updatedAt: now, fieldHlc }),
      deleted,
    }),
    toList,
  ),
  list_items: codec<ListItem, ListItemRow>(
    'list_items',
    (item, { fieldHlc, deleted }) => ({ ...toListItemRow(item, fieldHlc), deleted }),
    toListItem,
  ),
} as const;

/**
 * Reads one row whatever its tombstone says: a merge needs the clocks of a
 * deleted row too, or an edit could never bring it back.
 */
export const readSyncedRow = async <T>(
  tx: Transaction,
  { table, fromRow }: SyncedRowCodec<T>,
  id: string,
): Promise<StoredRow<T> | null> => {
  const rows = await tx.execute<Record<string, SqlValue>>(`SELECT * FROM ${table} WHERE id = ?`, [
    id,
  ]);
  const row = rows[0];
  if (row === undefined) return null;

  return { value: fromRow(row), fieldHlc: String(row.field_hlc), deleted: row.deleted === 1 };
};
