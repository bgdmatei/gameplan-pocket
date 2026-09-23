import { entryTagSchema } from '@gameplan/domain';
import type { EntryTag } from '@gameplan/domain';
import type { StorageAdapter } from '../adapter';
import type { Row } from './write';

export const ENTRY_TAG_TABLES = ['entry_tags'] as const;

export type TagSaveOptions = {
  createdAt: string;
  fieldHlc?: string;
};

export const toRow = (tag: EntryTag, { createdAt, fieldHlc }: TagSaveOptions): Row => ({
  id: tag.id,
  entry_id: tag.entryId,
  tag: tag.tag,
  created_at: createdAt,
  // A tag added again after being removed comes back, rather than staying
  // hidden behind its tombstone.
  deleted: false,
  field_hlc: fieldHlc ?? '{}',
});

export type TagRow = { id: string; entry_id: string; tag: string };

export const toTag = (row: TagRow): EntryTag =>
  entryTagSchema.parse({ id: row.id, entryId: row.entry_id, tag: row.tag });

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

/**
 * Every tag in use, with how many games carry it, for the library's filter
 * list. Archived games are left out, as they are from the library itself.
 */
export const listTagsInUse = async (
  adapter: StorageAdapter,
): Promise<{ tag: string; count: number }[]> =>
  adapter.execute<{ tag: string; count: number }>(
    `SELECT t.tag, COUNT(*) AS count
     FROM entry_tags t
     JOIN library_entries e ON e.id = t.entry_id AND e.deleted = 0 AND e.archived = 0
     WHERE t.deleted = 0
     GROUP BY t.tag
     ORDER BY count DESC, t.tag`,
  );
