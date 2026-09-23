import { gameSchema, listItemSchema, listSchema } from '@gameplan/domain';
import type { Game, List, ListItem } from '@gameplan/domain';
import type { StorageAdapter } from '../adapter';
import type { Row } from './write';

export const LIST_TABLES = ['lists', 'list_items', 'games'] as const;

export type ListSaveOptions = {
  updatedAt: string;
  fieldHlc?: string;
};

export const toListRow = (list: List, { updatedAt, fieldHlc }: ListSaveOptions): Row => ({
  id: list.id,
  name: list.name,
  description: list.description,
  created_at: list.createdAt,
  updated_at: updatedAt,
  field_hlc: fieldHlc ?? '{}',
});

export type ListRow = { id: string; name: string; description: string | null; created_at: string };

export const toList = (row: ListRow): List =>
  listSchema.parse({
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
  });

export type ListItemRow = { id: string; list_id: string; game_id: number; added_at: string };

export const toListItem = (row: ListItemRow): ListItem =>
  listItemSchema.parse({
    id: row.id,
    listId: row.list_id,
    gameId: row.game_id,
    addedAt: row.added_at,
  });

export const toListItemRow = (item: ListItem, fieldHlc?: string): Row => ({
  id: item.id,
  list_id: item.listId,
  game_id: item.gameId,
  added_at: item.addedAt,
  deleted: false,
  field_hlc: fieldHlc ?? '{}',
});

export const listLists = async (adapter: StorageAdapter): Promise<List[]> => {
  const rows = await adapter.execute<ListRow>(
    'SELECT id, name, description, created_at FROM lists WHERE deleted = 0 ORDER BY name',
  );
  return rows.map(toList);
};

export const getList = async (adapter: StorageAdapter, id: string): Promise<List | null> => {
  const rows = await adapter.execute<ListRow>('SELECT * FROM lists WHERE id = ? AND deleted = 0', [
    id,
  ]);
  const row = rows[0];
  return row === undefined ? null : toList(row);
};

/**
 * A deleted list hides its items through the join, not by tombstoning them:
 * deletes never cascade, so a list brought back by a later edit comes back
 * with its games on every device (SPEC-sync-core.md §Merge).
 */
export const listItemsOf = async (adapter: StorageAdapter, listId: string): Promise<ListItem[]> => {
  const rows = await adapter.execute<ListItemRow>(
    `SELECT i.id, i.list_id, i.game_id, i.added_at
     FROM list_items i
     JOIN lists l ON l.id = i.list_id AND l.deleted = 0
     WHERE i.list_id = ? AND i.deleted = 0
     ORDER BY i.added_at, i.id`,
    [listId],
  );
  return rows.map(toListItem);
};

type GameRow = {
  id: number;
  name: string;
  slug: string;
  summary: string | null;
  first_release_date: string | null;
  cover_image_id: string | null;
};

/**
 * The games on a list, oldest addition first. A game the device has not cached
 * is left out, the same rule the library grid follows: every row needs a name
 * and a cover to show.
 */
export const listGamesOf = async (adapter: StorageAdapter, listId: string): Promise<Game[]> => {
  const rows = await adapter.execute<GameRow>(
    `SELECT g.id, g.name, g.slug, g.summary, g.first_release_date, g.cover_image_id
     FROM list_items i
     JOIN lists l ON l.id = i.list_id AND l.deleted = 0
     JOIN games g ON g.id = i.game_id
     WHERE i.list_id = ? AND i.deleted = 0
     ORDER BY i.added_at, i.id`,
    [listId],
  );

  return rows.map((row) =>
    gameSchema.parse({
      id: row.id,
      name: row.name,
      slug: row.slug,
      summary: row.summary,
      firstReleaseDate: row.first_release_date,
      coverImageId: row.cover_image_id,
      genreIds: [],
      platformIds: [],
    }),
  );
};
