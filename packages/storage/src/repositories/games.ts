import { gameSchema, genreSchema, libraryEntrySchema, platformSchema } from '@gameplan/domain';
import type { Game, GameWithEntry, Genre, LibraryEntry, Platform } from '@gameplan/domain';
import type { SqlValue, StorageAdapter } from '../adapter';

/** Tables these queries read, so a change to any of them can refresh a screen. */
export const CATALOG_TABLES = [
  'games',
  'game_genres',
  'game_platforms',
  'genres',
  'platforms',
  'library_entries',
] as const;

export type UpsertGamesInput = {
  games: readonly Game[];
  genres?: readonly Genre[];
  platforms?: readonly Platform[];
  /** When this data came from the server; also drives pruning. */
  fetchedAt: string;
  catalogVersion?: number;
};

export type SearchOptions = { limit?: number };

type GameRow = {
  id: number;
  name: string;
  slug: string;
  summary: string | null;
  first_release_date: string | null;
  cover_image_id: string | null;
  genre_ids: string | null;
  platform_ids: string | null;
};

const idList = (value: string | null): number[] =>
  value === null || value === '' ? [] : value.split(',').map(Number);

const toGame = (row: GameRow): Game =>
  gameSchema.parse({
    id: row.id,
    name: row.name,
    slug: row.slug,
    summary: row.summary,
    firstReleaseDate: row.first_release_date,
    coverImageId: row.cover_image_id,
    genreIds: idList(row.genre_ids),
    platformIds: idList(row.platform_ids),
  });

const SELECT_GAME = `
  SELECT g.id, g.name, g.slug, g.summary, g.first_release_date, g.cover_image_id,
         (SELECT group_concat(genre_id) FROM game_genres WHERE game_id = g.id) AS genre_ids,
         (SELECT group_concat(platform_id) FROM game_platforms WHERE game_id = g.id) AS platform_ids
  FROM games g
`;

/**
 * Caches what the server told us about these games.
 *
 * Catalog data is server-authoritative: this only ever writes what it is
 * handed, and the whole batch lands in one transaction, so a failure part-way
 * leaves the cache as it was rather than half-updated.
 */
export const upsertGames = async (
  adapter: StorageAdapter,
  input: UpsertGamesInput,
): Promise<void> => {
  const { games, genres = [], platforms = [], fetchedAt, catalogVersion = 0 } = input;

  // Validate before opening the transaction, so a bad batch never starts a write.
  const validGames = games.map((game) => gameSchema.parse(game));
  const validGenres = genres.map((genre) => genreSchema.parse(genre));
  const validPlatforms = platforms.map((platform) => platformSchema.parse(platform));

  await adapter.transaction(async (tx) => {
    for (const genre of validGenres) {
      await tx.execute(
        `INSERT INTO genres (id, name, slug) VALUES (?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name, slug = excluded.slug`,
        [genre.id, genre.name, genre.slug],
      );
    }

    for (const platform of validPlatforms) {
      await tx.execute(
        `INSERT INTO platforms (id, name, abbreviation) VALUES (?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name, abbreviation = excluded.abbreviation`,
        [platform.id, platform.name, platform.abbreviation],
      );
    }

    for (const game of validGames) {
      await tx.execute(
        `INSERT INTO games (id, name, slug, summary, first_release_date, cover_image_id,
                            catalog_version, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           name = excluded.name, slug = excluded.slug, summary = excluded.summary,
           first_release_date = excluded.first_release_date,
           cover_image_id = excluded.cover_image_id,
           catalog_version = excluded.catalog_version, fetched_at = excluded.fetched_at`,
        [
          game.id,
          game.name,
          game.slug,
          game.summary,
          game.firstReleaseDate,
          game.coverImageId,
          catalogVersion,
          fetchedAt,
        ],
      );

      // The server's list replaces ours: a genre removed upstream must not
      // linger here, so these are rewritten rather than merged.
      await tx.execute('DELETE FROM game_genres WHERE game_id = ?', [game.id]);
      for (const genreId of game.genreIds) {
        await tx.execute(
          'INSERT INTO game_genres (game_id, genre_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
          [game.id, genreId],
        );
      }

      await tx.execute('DELETE FROM game_platforms WHERE game_id = ?', [game.id]);
      for (const platformId of game.platformIds) {
        await tx.execute(
          'INSERT INTO game_platforms (game_id, platform_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
          [game.id, platformId],
        );
      }
    }
  });
};

export const getGame = async (adapter: StorageAdapter, id: number): Promise<Game | null> => {
  const rows = await adapter.execute<GameRow>(`${SELECT_GAME} WHERE g.id = ?`, [id]);
  const row = rows[0];
  return row === undefined ? null : toGame(row);
};

/** Returns the games it has, in the order asked for; unknown ids are skipped. */
/**
 * Every cached genre and platform. Small tables (tens of rows), read whole:
 * the detail screen names a game's genres and platforms from them, and a game
 * can only be cached once the ones it refers to are.
 */
export const getReference = async (
  adapter: StorageAdapter,
): Promise<{ genres: Genre[]; platforms: Platform[] }> => {
  const genres = await adapter.execute<Genre>('SELECT id, name, slug FROM genres ORDER BY name');
  const platforms = await adapter.execute<Platform>(
    'SELECT id, name, abbreviation FROM platforms ORDER BY name',
  );
  return {
    genres: genres.map((genre) => genreSchema.parse(genre)),
    platforms: platforms.map((platform) => platformSchema.parse(platform)),
  };
};

export const getGamesByIds = async (
  adapter: StorageAdapter,
  ids: readonly number[],
): Promise<Game[]> => {
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => '?').join(', ');
  const rows = await adapter.execute<GameRow>(
    `${SELECT_GAME} WHERE g.id IN (${placeholders})`,
    ids as readonly SqlValue[],
  );

  const byId = new Map(rows.map((row) => [row.id, toGame(row)]));
  return ids.flatMap((id) => {
    const game = byId.get(id);
    return game === undefined ? [] : [game];
  });
};

/**
 * Turns what someone typed into a full-text search expression.
 *
 * Only letters and digits survive, each word quoted, with the last one given a
 * `*` so results appear while typing. That also makes the expression safe by
 * construction: quotes, `*`, `NEAR(`, `AND` and the rest are search operators
 * that would otherwise turn a title into a syntax error.
 *
 * Splitting on everything else is what makes `assassins` find `Assassin's
 * Creed` and `life` find `Half-Life`: the index is tokenised the same way.
 */
const toMatchExpression = (query: string): string | null => {
  const words = query.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  if (words === null || words.length === 0) return null;

  return words
    .map((word, index) => (index === words.length - 1 ? `"${word}"*` : `"${word}"`))
    .join(' ');
};

type SearchRow = GameRow & {
  e_id: string | null;
  e_game_id: number | null;
  e_status: string | null;
  e_rating: number | null;
  e_platform_id: number | null;
  e_progress: string | null;
  e_playtime_minutes: number | null;
  e_started_on: string | null;
  e_finished_on: string | null;
  e_favourite: number | null;
  e_shelved: number | null;
  e_archived: number | null;
  e_created_at: string | null;
};

const toEntry = (row: SearchRow): LibraryEntry | null => {
  if (row.e_id === null) return null;

  return libraryEntrySchema.parse({
    id: row.e_id,
    gameId: row.e_game_id,
    status: row.e_status,
    rating: row.e_rating,
    platformId: row.e_platform_id,
    progress: row.e_progress === null ? null : JSON.parse(row.e_progress),
    playtimeMinutes: row.e_playtime_minutes,
    startedOn: row.e_started_on,
    finishedOn: row.e_finished_on,
    favourite: row.e_favourite === 1,
    shelved: row.e_shelved === 1,
    archived: row.e_archived === 1,
    createdAt: row.e_created_at,
  });
};

/**
 * Searches cached games, best match first, and says whether each is already in
 * the library so a result can offer *Add* or show its status.
 *
 * Local and instant: this runs against the device's own copy, so it works
 * offline and needs no round trip while typing. The server search fills the
 * cache; this reads it.
 */
export const searchGames = async (
  adapter: StorageAdapter,
  query: string,
  options: SearchOptions = {},
): Promise<GameWithEntry[]> => {
  const expression = toMatchExpression(query);
  if (expression === null) return [];

  const rows = await adapter.execute<SearchRow>(
    `SELECT g.id, g.name, g.slug, g.summary, g.first_release_date, g.cover_image_id,
            (SELECT group_concat(genre_id) FROM game_genres WHERE game_id = g.id) AS genre_ids,
            (SELECT group_concat(platform_id) FROM game_platforms WHERE game_id = g.id) AS platform_ids,
            e.id AS e_id, e.game_id AS e_game_id, e.status AS e_status, e.rating AS e_rating,
            e.platform_id AS e_platform_id, e.progress AS e_progress,
            e.playtime_minutes AS e_playtime_minutes, e.started_on AS e_started_on,
            e.finished_on AS e_finished_on, e.favourite AS e_favourite, e.shelved AS e_shelved,
            e.archived AS e_archived, e.created_at AS e_created_at
     FROM games_fts
     JOIN games g ON g.id = games_fts.rowid
     LEFT JOIN library_entries e ON e.game_id = g.id AND e.deleted = 0
     WHERE games_fts MATCH ?
     ORDER BY rank
     LIMIT ?`,
    [expression, options.limit ?? 20],
  );

  return rows.map((row) => ({ game: toGame(row), entry: toEntry(row) }));
};

export type PruneOptions = {
  /** Games fetched at or after this moment are kept: they were just looked at. */
  keepFetchedSince: string;
};

/**
 * Drops cached games nobody needs any more, and returns how many went.
 *
 * Kept: games in the library, games on a list, and games fetched recently —
 * which stands in for "recently viewed", since fetching is what viewing causes.
 * Tombstoned entries do not count: a removed game has no claim on the cache.
 *
 * Join rows and the search index follow automatically, through the schema's
 * cascade and triggers.
 */
export const pruneCatalog = async (
  adapter: StorageAdapter,
  { keepFetchedSince }: PruneOptions,
): Promise<number> => {
  const rows = await adapter.execute<{ count: number }>(
    `SELECT COUNT(*) AS count FROM games g
     WHERE g.fetched_at < ?
       AND NOT EXISTS (SELECT 1 FROM library_entries e WHERE e.game_id = g.id AND e.deleted = 0)
       AND NOT EXISTS (SELECT 1 FROM list_items i WHERE i.game_id = g.id AND i.deleted = 0)`,
    [keepFetchedSince],
  );

  await adapter.execute(
    `DELETE FROM games
     WHERE fetched_at < ?
       AND NOT EXISTS (
         SELECT 1 FROM library_entries e WHERE e.game_id = games.id AND e.deleted = 0
       )
       AND NOT EXISTS (
         SELECT 1 FROM list_items i WHERE i.game_id = games.id AND i.deleted = 0
       )`,
    [keepFetchedSince],
  );

  return rows[0]?.count ?? 0;
};
