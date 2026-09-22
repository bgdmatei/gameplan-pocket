import { entryTagSchema } from '@gameplan/domain';
import type { EntryTag } from '@gameplan/domain';
import type { StorageAdapter } from '../adapter';
import { writeAtomically } from './write';
import type { PendingOp, Row } from './write';

export const ENTRY_TAG_TABLES = ['entry_tags'] as const;

export type TagSaveOptions = {
  createdAt: string;
  fieldHlc?: string;
  op?: PendingOp;
};

const toRow = (tag: EntryTag, { createdAt, fieldHlc }: TagSaveOptions): Row => ({
  id: tag.id,
  entry_id: tag.entryId,
  tag: tag.tag,
  created_at: createdAt,
  // A tag added again after being removed comes back, rather than staying
  // hidden behind its tombstone.
  deleted: false,
  field_hlc: fieldHlc ?? '{}',
});

type TagRow = { id: string; entry_id: string; tag: string };

const toTag = (row: TagRow): EntryTag =>
  entryTagSchema.parse({ id: row.id, entryId: row.entry_id, tag: row.tag });

/**
 * Adds a tag. The id comes from the domain's identity key, so the same tag
 * added on two devices while offline produces one row rather than two, and
 * adding it twice on one device changes nothing.
 */
export const addEntryTag = async (
  adapter: StorageAdapter,
  tag: EntryTag,
  options: TagSaveOptions,
): Promise<void> => {
  await writeAtomically(adapter, {
    rows: [{ table: 'entry_tags', row: toRow(tag, options) }],
    ...(options.op === undefined ? {} : { ops: [options.op] }),
  });
};

/** Tombstoned, not deleted, so the removal reaches other devices. */
export const removeEntryTag = async (
  adapter: StorageAdapter,
  id: string,
  options: { op?: PendingOp } = {},
): Promise<void> => {
  await adapter.transaction(async (tx) => {
    await tx.execute('UPDATE entry_tags SET deleted = 1 WHERE id = ?', [id]);

    if (options.op !== undefined) {
      await tx.execute('INSERT INTO pending_ops (id, payload, created_at) VALUES (?, ?, ?)', [
        options.op.id,
        options.op.payload,
        options.op.createdAt,
      ]);
    }
  });
};

/** A game's tags, alphabetically, which is how they are shown. */
export const listEntryTags = async (
  adapter: StorageAdapter,
  entryId: string,
): Promise<EntryTag[]> => {
  const rows = await adapter.execute<TagRow>(
    'SELECT id, entry_id, tag FROM entry_tags WHERE entry_id = ? AND deleted = 0 ORDER BY tag',
    [entryId],
  );
  return rows.map(toTag);
};

/** Every tag in use, with how many games carry it, for a filter list. */
export const listTagsInUse = async (
  adapter: StorageAdapter,
): Promise<{ tag: string; count: number }[]> =>
  adapter.execute<{ tag: string; count: number }>(
    `SELECT t.tag, COUNT(*) AS count
     FROM entry_tags t
     JOIN library_entries e ON e.id = t.entry_id AND e.deleted = 0
     WHERE t.deleted = 0
     GROUP BY t.tag
     ORDER BY count DESC, t.tag`,
  );
