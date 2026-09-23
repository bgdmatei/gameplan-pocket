import { gameSchema, libraryEntrySchema } from '@gameplan/domain';
import type { EntryStatus, Game, LibraryEntry } from '@gameplan/domain';
import type { SqlValue, StorageAdapter } from '../adapter';
import type { Row } from './write';

/** Tables these queries read, so a change to either can refresh the screen. */
export const LIBRARY_ENTRY_TABLES = ['library_entries', 'games', 'entry_tags'] as const;

/** A row of the library: the user's entry plus the game it refers to. */
export type LibraryEntryWithGame = { entry: LibraryEntry; game: Game };

export type LibrarySort = 'recent' | 'name' | 'rating' | 'playtime';

export type ListLibraryOptions = {
  status?: EntryStatus;
  favourite?: boolean;
  /** `true` lists the Archive; the library shows only games not archived. */
  archived?: boolean;
  tag?: string;
  sort?: LibrarySort;
  limit?: number;
  /** Opaque value from the previous page's `nextCursor`. */
  cursor?: string;
};

export type LibraryPage = {
  rows: LibraryEntryWithGame[];
  /** Absent when this was the last page. */
  nextCursor?: string;
};

export type SaveOptions = {
  updatedAt: string;
  /** Per-field clocks, written by `sync-core`. */
  fieldHlc?: string;
};

export const toRow = (entry: LibraryEntry, { updatedAt, fieldHlc }: SaveOptions): Row => ({
  id: entry.id,
  game_id: entry.gameId,
  status: entry.status,
  rating: entry.rating,
  platform_id: entry.platformId,
  // Progress is stored as one JSON value: its type and value belong together.
  progress: entry.progress === null ? null : JSON.stringify(entry.progress),
  playtime_minutes: entry.playtimeMinutes,
  started_on: entry.startedOn,
  finished_on: entry.finishedOn,
  favourite: entry.favourite,
  archived: entry.archived,
  created_at: entry.createdAt,
  updated_at: updatedAt,
  field_hlc: fieldHlc ?? '{}',
});

export type EntryRow = {
  id: string;
  game_id: number;
  status: string;
  rating: number | null;
  platform_id: number | null;
  progress: string | null;
  playtime_minutes: number;
  started_on: string | null;
  finished_on: string | null;
  favourite: number;
  archived: number;
  created_at: string;
};

/**
 * Parses a row through the domain schema, so a corrupt row fails here with a
 * clear message rather than surfacing as odd behaviour in a screen.
 */
export const toEntry = (row: EntryRow): LibraryEntry =>
  libraryEntrySchema.parse({
    id: row.id,
    gameId: row.game_id,
    status: row.status,
    rating: row.rating,
    platformId: row.platform_id,
    progress: row.progress === null ? null : JSON.parse(row.progress),
    playtimeMinutes: row.playtime_minutes,
    startedOn: row.started_on,
    finishedOn: row.finished_on,
    favourite: row.favourite === 1,
    archived: row.archived === 1,
    createdAt: row.created_at,
  });

type GameRow = {
  g_id: number;
  g_name: string;
  g_slug: string;
  g_summary: string | null;
  g_first_release_date: string | null;
  g_cover_image_id: string | null;
  genre_ids: string | null;
  platform_ids: string | null;
};

const idList = (value: string | null): number[] =>
  value === null || value === '' ? [] : value.split(',').map(Number);

const toGame = (row: GameRow): Game =>
  gameSchema.parse({
    id: row.g_id,
    name: row.g_name,
    slug: row.g_slug,
    summary: row.g_summary,
    firstReleaseDate: row.g_first_release_date,
    coverImageId: row.g_cover_image_id,
    genreIds: idList(row.genre_ids),
    platformIds: idList(row.platform_ids),
  });

const SELECT_ROW = `
  SELECT e.id, e.game_id, e.status, e.rating, e.platform_id, e.progress,
         e.playtime_minutes, e.started_on, e.finished_on, e.favourite, e.archived,
         e.created_at, e.updated_at,
         g.id AS g_id, g.name AS g_name, g.slug AS g_slug, g.summary AS g_summary,
         g.first_release_date AS g_first_release_date, g.cover_image_id AS g_cover_image_id,
         (SELECT group_concat(genre_id) FROM game_genres WHERE game_id = g.id) AS genre_ids,
         (SELECT group_concat(platform_id) FROM game_platforms WHERE game_id = g.id) AS platform_ids
  FROM library_entries e
  JOIN games g ON g.id = e.game_id
`;

/**
 * Sort keys. Each ends in `id` so the order is total: without a tiebreaker,
 * rows sharing a value could repeat or vanish while paging.
 *
 * `COALESCE` keeps nullable columns comparable, which keyset paging needs: a
 * NULL rating sorts as if it were -1 rather than dropping out of comparisons.
 */
const SORTS: Record<LibrarySort, { column: string; direction: 'ASC' | 'DESC' }> = {
  recent: { column: 'e.updated_at', direction: 'DESC' },
  name: { column: 'g.name', direction: 'ASC' },
  rating: { column: 'COALESCE(e.rating, -1)', direction: 'DESC' },
  playtime: { column: 'e.playtime_minutes', direction: 'DESC' },
};

const encodeCursor = (value: SqlValue, id: string): string => JSON.stringify([value, id]);

const decodeCursor = (cursor: string): [SqlValue, string] => {
  try {
    const parsed: unknown = JSON.parse(cursor);
    if (Array.isArray(parsed) && parsed.length === 2 && typeof parsed[1] === 'string') {
      return [parsed[0] as SqlValue, parsed[1]];
    }
  } catch {
    // fall through to the error below
  }
  throw new Error(`Not a cursor from this repository: ${cursor}`);
};

/**
 * One page of the library, filtered and sorted in SQL.
 *
 * Paging is keyset, not OFFSET: the next page starts after the last row's sort
 * key, so scrolling stays fast at 5,000 entries and rows cannot shift between
 * pages when something changes.
 *
 * An entry whose game is not cached locally is left out: every screen shows a
 * game's name and cover, and the add-to-library flow caches the game first, so
 * a missing game means an incomplete sync rather than something to display.
 */
export const listLibraryEntries = async (
  adapter: StorageAdapter,
  options: ListLibraryOptions = {},
): Promise<LibraryPage> => {
  const { status, favourite, archived = false, tag, sort = 'recent', limit = 50, cursor } = options;
  const { column, direction } = SORTS[sort];
  const conditions = ['e.deleted = 0', 'e.archived = ?'];
  const params: SqlValue[] = [archived];

  if (status !== undefined) {
    conditions.push('e.status = ?');
    params.push(status);
  }
  if (favourite !== undefined) {
    conditions.push('e.favourite = ?');
    params.push(favourite);
  }
  if (tag !== undefined) {
    conditions.push(
      'EXISTS (SELECT 1 FROM entry_tags t WHERE t.entry_id = e.id AND t.tag = ? AND t.deleted = 0)',
    );
    params.push(tag);
  }
  if (cursor !== undefined) {
    const [value, id] = decodeCursor(cursor);
    // Continue after the last row: strictly past its sort value, or equal to it
    // with a later id.
    const comparison = direction === 'DESC' ? '<' : '>';
    conditions.push(`(${column} ${comparison} ? OR (${column} = ? AND e.id ${comparison} ?))`);
    params.push(value, value, id);
  }

  const sql = `${SELECT_ROW}
    WHERE ${conditions.join(' AND ')}
    ORDER BY ${column} ${direction}, e.id ${direction}
    LIMIT ?`;

  const rows = await adapter.execute<EntryRow & GameRow & Record<string, SqlValue>>(sql, [
    ...params,
    limit + 1,
  ]);

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const hasMore = rows.length > limit;

  return {
    rows: page.map((row) => ({ entry: toEntry(row), game: toGame(row) })),
    ...(hasMore && last !== undefined
      ? { nextCursor: encodeCursor(sortValueOf(last, sort), last.id) }
      : {}),
  };
};

/** The value the cursor continues from, matching the SQL sort expression. */
const sortValueOf = (
  row: EntryRow & { updated_at?: string; g_name?: string },
  sort: LibrarySort,
) => {
  switch (sort) {
    case 'recent':
      return row.updated_at ?? null;
    case 'name':
      return row.g_name ?? null;
    case 'rating':
      return row.rating ?? -1;
    case 'playtime':
      return row.playtime_minutes;
  }
};

export const getLibraryEntry = async (
  adapter: StorageAdapter,
  id: string,
): Promise<LibraryEntry | null> => {
  const rows = await adapter.execute<EntryRow>(
    'SELECT * FROM library_entries WHERE id = ? AND deleted = 0',
    [id],
  );
  const row = rows[0];
  return row === undefined ? null : toEntry(row);
};

export const getLibraryEntryByGame = async (
  adapter: StorageAdapter,
  gameId: number,
): Promise<LibraryEntry | null> => {
  const rows = await adapter.execute<EntryRow>(
    'SELECT * FROM library_entries WHERE game_id = ? AND deleted = 0',
    [gameId],
  );
  const row = rows[0];
  return row === undefined ? null : toEntry(row);
};
