import { gameSchema, libraryEntrySchema } from '@gameplan/domain';
import type { EntryStatus, Game, LibraryEntry } from '@gameplan/domain';
import type { SqlValue, StorageAdapter } from '../adapter';
import type { Row } from './write';

/** Tables these queries read, so a change to any of them can refresh the screen. */
export const LIBRARY_ENTRY_TABLES = [
  'library_entries',
  'games',
  'entry_tags',
  'note_items',
  'game_genres',
] as const;

/**
 * One cell of the library grid: only what the cell shows, plus the open-note
 * badge. The detail screen reads the full entry and game separately.
 */
export type LibraryGridRow = Pick<
  LibraryEntry,
  'id' | 'gameId' | 'status' | 'rating' | 'favourite' | 'platformId'
> &
  Pick<Game, 'name' | 'coverImageId'> & { openNotes: number };

/** `released` orders by release date; see `releasedBy` for what counts as released. */
export type LibrarySort = 'recent' | 'released' | 'name' | 'rating' | 'playtime';

export type SortDirection = 'asc' | 'desc';

export type ListLibraryOptions = {
  status?: EntryStatus;
  /** Leaves one status out: the library's All hides Playing, which lives on the shelf. */
  excludeStatus?: EntryStatus;
  favourite?: boolean;
  /** `true` lists the Archive; the library shows only games not archived. */
  archived?: boolean;
  tag?: string;
  genreId?: number;
  sort?: LibrarySort;
  /**
   * Overrides the sort's natural order (newest, A to Z, highest first).
   * Games with no release date, or no rating, go last either way.
   */
  direction?: SortDirection;
  /**
   * For the `released` sort: the last date that counts as released, such as
   * the end of this year. Later and undated games go last. A parameter because
   * storage reads no clock; without it every dated game counts.
   */
  releasedBy?: string;
  limit?: number;
  /** Opaque value from the previous page's `nextCursor`. */
  cursor?: string;
};

export type LibraryPage = {
  rows: LibraryGridRow[];
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
  shelved: entry.shelved,
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
  shelved: number;
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
    shelved: row.shelved === 1,
    archived: row.archived === 1,
    createdAt: row.created_at,
  });

type GridRow = {
  id: string;
  game_id: number;
  status: string;
  rating: number | null;
  favourite: number;
  platform_id: number | null;
  name: string;
  cover_image_id: string | null;
  open_notes: number;
  // Read for the cursor only.
  updated_at: string;
  playtime_minutes: number;
  first_release_date: string | null;
};

const gridEntrySchema = libraryEntrySchema.pick({
  id: true,
  gameId: true,
  status: true,
  rating: true,
  favourite: true,
  platformId: true,
});
const gridGameSchema = gameSchema.pick({ name: true, coverImageId: true });

/** Parsed like a full entry, so a corrupt row fails here rather than in a cell. */
const toGridRow = (row: GridRow): LibraryGridRow => ({
  ...gridEntrySchema.parse({
    id: row.id,
    gameId: row.game_id,
    status: row.status,
    rating: row.rating,
    favourite: row.favourite === 1,
    platformId: row.platform_id,
  }),
  ...gridGameSchema.parse({ name: row.name, coverImageId: row.cover_image_id }),
  openNotes: row.open_notes,
});

/**
 * Only the columns a cell renders (plan §12.2). The open-note count is a
 * correlated count over `idx_note_items_entry (entry_id, resolved)`, one index
 * lookup per row on the page.
 */
const SELECT_GRID = `
  SELECT e.id, e.game_id, e.status, e.rating, e.favourite, e.platform_id, e.updated_at,
         e.playtime_minutes,
         g.name, g.cover_image_id, g.first_release_date,
         (SELECT COUNT(*) FROM note_items n
          WHERE n.entry_id = e.id AND n.resolved = 0 AND n.deleted = 0) AS open_notes
  FROM library_entries e
  JOIN games g ON g.id = e.game_id
`;

/**
 * Sort keys and each one's natural order. Every sort ends in `id` so the
 * order is total: without a tiebreaker, rows sharing a value could repeat or
 * vanish while paging.
 *
 * Nullable keys go through `COALESCE` with a stand-in (see `missingValue`),
 * which keyset paging needs: a NULL would drop out of the cursor comparison.
 * The stand-in is a bound parameter, the same value the cursor is built from.
 */
const SORTS: Record<LibrarySort, { column: string; natural: SortDirection }> = {
  recent: { column: 'e.updated_at', natural: 'desc' },
  released: {
    column: 'COALESCE(CASE WHEN g.first_release_date <= ? THEN g.first_release_date END, ?)',
    natural: 'desc',
  },
  name: { column: 'g.name', natural: 'asc' },
  rating: { column: 'COALESCE(e.rating, ?)', natural: 'desc' },
  playtime: { column: 'e.playtime_minutes', natural: 'desc' },
};

/**
 * What an undated or unrated game sorts as: past the end in whichever
 * direction, so those games come last both ways. '' is below every date and
 * '~' above; ratings run 0 to 10.
 */
const missingValue = (sort: LibrarySort, direction: SortDirection): SqlValue => {
  if (sort === 'released') return direction === 'desc' ? '' : '~';
  if (sort === 'rating') return direction === 'desc' ? -1 : 11;
  return null;
};

/** Later than any real date, so every dated game counts as released. */
const NO_CUTOFF = '9999-12-31';

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
export const listLibraryGrid = async (
  adapter: StorageAdapter,
  options: ListLibraryOptions = {},
): Promise<LibraryPage> => {
  const {
    status,
    excludeStatus,
    favourite,
    archived = false,
    tag,
    genreId,
    sort = 'recent',
    releasedBy = NO_CUTOFF,
    limit = 50,
    cursor,
  } = options;
  const { column, natural } = SORTS[sort];
  const direction = options.direction ?? natural;
  const missing = missingValue(sort, direction);
  // The sort expression's own parameters, bound wherever the expression appears.
  const sortParams: SqlValue[] =
    sort === 'released' ? [releasedBy, missing] : sort === 'rating' ? [missing] : [];
  const order = direction === 'desc' ? 'DESC' : 'ASC';
  const conditions = ['e.deleted = 0', 'e.archived = ?'];
  const params: SqlValue[] = [archived];

  if (status !== undefined) {
    conditions.push('e.status = ?');
    params.push(status);
  }
  if (excludeStatus !== undefined) {
    conditions.push('e.status <> ?');
    params.push(excludeStatus);
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
  if (genreId !== undefined) {
    conditions.push(
      'EXISTS (SELECT 1 FROM game_genres gg WHERE gg.game_id = e.game_id AND gg.genre_id = ?)',
    );
    params.push(genreId);
  }
  if (cursor !== undefined) {
    const [value, id] = decodeCursor(cursor);
    // Continue after the last row: strictly past its sort value, or equal to it
    // with a later id.
    const comparison = direction === 'desc' ? '<' : '>';
    conditions.push(`(${column} ${comparison} ? OR (${column} = ? AND e.id ${comparison} ?))`);
    params.push(...sortParams, value, ...sortParams, value, id);
  }

  const sql = `${SELECT_GRID}
    WHERE ${conditions.join(' AND ')}
    ORDER BY ${column} ${order}, e.id ${order}
    LIMIT ?`;

  const rows = await adapter.execute<GridRow>(sql, [...params, ...sortParams, limit + 1]);

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const hasMore = rows.length > limit;

  return {
    rows: page.map(toGridRow),
    ...(hasMore && last !== undefined
      ? { nextCursor: encodeCursor(sortValueOf(last, sort, releasedBy, missing), last.id) }
      : {}),
  };
};

/** The value the cursor continues from, matching the SQL sort expression. */
const sortValueOf = (
  row: GridRow,
  sort: LibrarySort,
  releasedBy: string,
  missing: SqlValue,
): SqlValue => {
  switch (sort) {
    case 'recent':
      return row.updated_at;
    case 'released': {
      const date = row.first_release_date;
      return date !== null && date <= releasedBy ? date : missing;
    }
    case 'name':
      return row.name;
    case 'rating':
      return row.rating ?? missing;
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

/**
 * The genres of games in the library, with how many games each, for the
 * library's genre filter. Archived games are left out, as they are from the
 * library itself.
 */
export const listGenresInLibrary = async (
  adapter: StorageAdapter,
): Promise<{ id: number; name: string; count: number }[]> =>
  adapter.execute<{ id: number; name: string; count: number }>(
    `SELECT ge.id, ge.name, COUNT(*) AS count
     FROM library_entries e
     JOIN game_genres gg ON gg.game_id = e.game_id
     JOIN genres ge ON ge.id = gg.genre_id
     WHERE e.deleted = 0 AND e.archived = 0
     GROUP BY ge.id, ge.name
     ORDER BY ge.name`,
  );

/** How many games the Now Playing shelf shows. */
export const SHELF_SIZE = 5;

export type ShelfGame = Pick<LibraryEntry, 'id' | 'gameId'> & Pick<Game, 'name' | 'coverImageId'>;

/**
 * Every game being played, for the Now Playing shelf: the most recently
 * started first, then by name. The shelf shows the first `SHELF_SIZE` and a
 * sheet the rest (spec decision 20). Few enough to read whole.
 */
export const listNowPlaying = async (adapter: StorageAdapter): Promise<ShelfGame[]> => {
  const rows = await adapter.execute<{
    id: string;
    game_id: number;
    name: string;
    cover_image_id: string | null;
  }>(
    `SELECT e.id, e.game_id, g.name, g.cover_image_id
     FROM library_entries e
     JOIN games g ON g.id = e.game_id
     WHERE e.deleted = 0 AND e.archived = 0 AND e.status = 'playing'
     ORDER BY e.started_on IS NULL, e.started_on DESC, g.name, e.id`,
  );
  return rows.map((row) => ({
    id: row.id,
    gameId: row.game_id,
    name: row.name,
    coverImageId: row.cover_image_id,
  }));
};
