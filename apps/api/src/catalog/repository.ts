import type { Game, Genre, Platform } from '@gameplan/domain';
import { sql } from 'kysely';
import type { Kysely, Selectable } from 'kysely';
import type { Database, GamesTable } from '../db/schema';

/** How long a remote search result is trusted before IGDB is asked again. */
const SEARCH_CACHE_TTL = '24 hours';

const toGame = (row: Selectable<GamesTable>): Game => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  summary: row.summary,
  firstReleaseDate: row.first_release_date,
  coverImageId: row.cover_image_id,
  genreIds: row.genre_ids,
  platformIds: row.platform_ids,
});

/** Every SQL statement the catalog runs. */
export type CatalogRepository = ReturnType<typeof createCatalogRepository>;

export const createCatalogRepository = (db: Kysely<Database>) => ({
  /** Inserts or refreshes games; each write takes a new catalog version. */
  upsertGames: async (games: readonly Game[]): Promise<void> => {
    if (games.length === 0) return;

    await db
      .insertInto('games')
      .values(
        games.map((game) => ({
          id: game.id,
          name: game.name,
          slug: game.slug,
          summary: game.summary,
          first_release_date: game.firstReleaseDate,
          cover_image_id: game.coverImageId,
          genre_ids: game.genreIds,
          platform_ids: game.platformIds,
        })),
      )
      .onConflict((conflict) =>
        conflict.column('id').doUpdateSet((eb) => ({
          name: eb.ref('excluded.name'),
          slug: eb.ref('excluded.slug'),
          summary: eb.ref('excluded.summary'),
          first_release_date: eb.ref('excluded.first_release_date'),
          cover_image_id: eb.ref('excluded.cover_image_id'),
          genre_ids: eb.ref('excluded.genre_ids'),
          platform_ids: eb.ref('excluded.platform_ids'),
          fetched_at: sql<Date>`now()`,
          catalog_version: sql<number>`nextval('catalog_version_seq')`,
        })),
      )
      .execute();
  },

  /** The cached games among `ids`, in the order asked for. */
  getGames: async (ids: readonly number[]): Promise<Game[]> => {
    if (ids.length === 0) return [];
    const rows = await db
      .selectFrom('games')
      .selectAll()
      .where('id', 'in', [...ids])
      .execute();
    const byId = new Map(rows.map((row) => [row.id, toGame(row)]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  },

  /**
   * Fuzzy name search over cached games. `<%` matches when the query is close
   * to some part of the name (word similarity ≥ 0.6, pg_trgm's default), which
   * finds subtitled titles from a partial name and survives a typo, and it
   * uses the trigram index. Closest first.
   */
  searchByName: async (text: string, limit: number): Promise<Game[]> => {
    const rows = await db
      .selectFrom('games')
      .selectAll()
      .where(sql<boolean>`${text} <% name`)
      .orderBy(sql`word_similarity(${text}, name)`, 'desc')
      .orderBy(sql`similarity(${text}, name)`, 'desc')
      .orderBy('name')
      .limit(limit)
      .execute();
    return rows.map(toGame);
  },

  /** Ids a recent remote search returned for this query, or `null` if none is fresh. */
  getCachedSearch: async (query: string): Promise<number[] | null> => {
    const row = await db
      .selectFrom('search_cache')
      .select('game_ids')
      .where('query', '=', query)
      .where('fetched_at', '>', sql<Date>`now() - ${SEARCH_CACHE_TTL}::interval`)
      .executeTakeFirst();
    return row?.game_ids ?? null;
  },

  saveSearch: async (query: string, gameIds: readonly number[]): Promise<void> => {
    await db
      .insertInto('search_cache')
      .values({ query, game_ids: [...gameIds] })
      .onConflict((conflict) =>
        conflict.column('query').doUpdateSet({ game_ids: [...gameIds], fetched_at: sql`now()` }),
      )
      .execute();
  },

  upsertReference: async ({ genres, platforms }: { genres: Genre[]; platforms: Platform[] }) => {
    await db.transaction().execute(async (tx) => {
      if (genres.length > 0) {
        await tx
          .insertInto('genres')
          .values(genres)
          .onConflict((c) =>
            c.column('id').doUpdateSet((eb) => ({
              name: eb.ref('excluded.name'),
              slug: eb.ref('excluded.slug'),
              fetched_at: sql`now()`,
            })),
          )
          .execute();
      }
      if (platforms.length > 0) {
        await tx
          .insertInto('platforms')
          .values(platforms)
          .onConflict((c) =>
            c.column('id').doUpdateSet((eb) => ({
              name: eb.ref('excluded.name'),
              abbreviation: eb.ref('excluded.abbreviation'),
              fetched_at: sql`now()`,
            })),
          )
          .execute();
      }
    });
  },

  /** Genres and platforms, and whether they were fetched within the last day. */
  getReference: async (): Promise<{ genres: Genre[]; platforms: Platform[]; fresh: boolean }> => {
    const [genres, platforms, oldest] = await Promise.all([
      db.selectFrom('genres').select(['id', 'name', 'slug']).orderBy('name').execute(),
      db.selectFrom('platforms').select(['id', 'name', 'abbreviation']).orderBy('name').execute(),
      db
        .selectFrom('genres')
        .select(sql<boolean>`min(fetched_at) > now() - interval '1 day'`.as('fresh'))
        .executeTakeFirst(),
    ]);
    return { genres, platforms, fresh: genres.length > 0 && oldest?.fresh === true };
  },
});
