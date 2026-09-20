import { gameSchema, listItemSchema, listSchema } from '@gameplan/domain';
import type { Game, List, ListItem } from '@gameplan/domain';
import type { StorageAdapter } from '../adapter';
import { writeAtomically } from './write';
import type { PendingOp, Row } from './write';

export const LIST_TABLES = ['lists', 'list_items', 'games'] as const;

export type ListSaveOptions = {
  updatedAt: string;
  fieldHlc?: string;
  op?: PendingOp;
};

const toListRow = (list: List, { updatedAt, fieldHlc }: ListSaveOptions): Row => ({
  id: list.id,
  name: list.name,
  description: list.description,
  created_at: list.createdAt,
  updated_at: updatedAt,
  field_hlc: fieldHlc ?? '{}',
});

type ListRow = { id: string; name: string; description: string | null; created_at: string };

const toList = (row: ListRow): List =>
  listSchema.parse({
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
  });

type ListItemRow = { id: string; list_id: string; game_id: number; added_at: string };

const toListItem = (row: ListItemRow): ListItem =>
  listItemSchema.parse({
    id: row.id,
    listId: row.list_id,
    gameId: row.game_id,
    addedAt: row.added_at,
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

export const saveList = async (
  adapter: StorageAdapter,
  list: List,
  options: ListSaveOptions,
): Promise<void> => {
  await writeAtomically(adapter, {
    rows: [{ table: 'lists', row: toListRow(list, options) }],
    ...(options.op === undefined ? {} : { ops: [options.op] }),
  });
};

/**
 * Tombstones the list and everything in it, in one transaction: a list whose
 * items outlived it would leave rows pointing at nothing, and half a deletion
 * would sync as half a deletion.
 */
export const softDeleteList = async (
  adapter: StorageAdapter,
  id: string,
  options: ListSaveOptions,
): Promise<void> => {
  await adapter.transaction(async (tx) => {
    await tx.execute('UPDATE lists SET deleted = 1, updated_at = ? WHERE id = ?', [
      options.updatedAt,
      id,
    ]);
    await tx.execute('UPDATE list_items SET deleted = 1 WHERE list_id = ?', [id]);

    if (options.op !== undefined) {
      await tx.execute('INSERT INTO pending_ops (id, payload, created_at) VALUES (?, ?, ?)', [
        options.op.id,
        options.op.payload,
        options.op.createdAt,
      ]);
    }
  });
};

/** Adding a game already on the list changes nothing, thanks to the shared id. */
export const addGameToList = async (
  adapter: StorageAdapter,
  item: ListItem,
  options: { fieldHlc?: string; op?: PendingOp } = {},
): Promise<void> => {
  await writeAtomically(adapter, {
    rows: [
      {
        table: 'list_items',
        row: {
          id: item.id,
          list_id: item.listId,
          game_id: item.gameId,
          added_at: item.addedAt,
          deleted: false,
          field_hlc: options.fieldHlc ?? '{}',
        },
      },
    ],
    ...(options.op === undefined ? {} : { ops: [options.op] }),
  });
};

export const removeGameFromList = async (
  adapter: StorageAdapter,
  id: string,
  options: { op?: PendingOp } = {},
): Promise<void> => {
  await adapter.transaction(async (tx) => {
    await tx.execute('UPDATE list_items SET deleted = 1 WHERE id = ?', [id]);

    if (options.op !== undefined) {
      await tx.execute('INSERT INTO pending_ops (id, payload, created_at) VALUES (?, ?, ?)', [
        options.op.id,
        options.op.payload,
        options.op.createdAt,
      ]);
    }
  });
};

export const listItemsOf = async (adapter: StorageAdapter, listId: string): Promise<ListItem[]> => {
  const rows = await adapter.execute<ListItemRow>(
    `SELECT id, list_id, game_id, added_at FROM list_items
     WHERE list_id = ? AND deleted = 0 ORDER BY added_at, id`,
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
