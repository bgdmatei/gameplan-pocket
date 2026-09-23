import type { Game, Genre, Platform } from '@gameplan/domain';
import type { Logger } from '../logger';
import { IgdbError } from './igdb/client';
import type { IgdbClient } from './igdb/client';
import { QueueFullError } from './igdb/queue';
import type { CatalogRepository } from './repository';

/** Fewer good local matches than this, and IGDB is asked too. */
const ENOUGH_LOCAL_MATCHES = 5;

/** `stale`: IGDB could not be asked, so this is the cache alone. */
export type Stale<T> = T & { stale: boolean };

/** Trimmed, lowercased, inner whitespace collapsed: one cache key per search. */
export const normaliseQuery = (text: string): string =>
  text.trim().replace(/\s+/g, ' ').toLowerCase();

/** A failure kind for the log line; never the error's message. */
const describeFailure = (error: unknown): string => {
  if (error instanceof IgdbError) return error.failure;
  if (error instanceof QueueFullError) return 'queue-full';
  return 'unexpected';
};

export type CatalogService = ReturnType<typeof createCatalogService>;

/**
 * The catalog's decisions: answer from the cache when it can, ask IGDB when
 * it must, and when IGDB cannot answer, serve the cache marked `stale`.
 *
 * Only IGDB's failures become `stale`. A database failure is ours, and still
 * surfaces as an error rather than an empty result that hides an outage.
 */
export const createCatalogService = ({
  repository,
  igdb,
  logger,
}: {
  repository: CatalogRepository;
  igdb: IgdbClient;
  logger: Logger;
}) => {
  /** Runs an IGDB call; `null` when IGDB could not answer. */
  const ask = async <T>(what: string, call: () => Promise<T>): Promise<T | null> => {
    try {
      return await call();
    } catch (error) {
      logger.warn(`IGDB ${what} failed (${describeFailure(error)}); serving the cache.`);
      return null;
    }
  };

  const getGames = async (ids: readonly number[]): Promise<Stale<{ games: Game[] }>> => {
    const cached = await repository.getGames(ids);
    const known = new Set(cached.map((game) => game.id));
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length === 0) return { games: cached, stale: false };

    // One request for every missing game, never one per game.
    const fetched = await ask('lookup', () => igdb.getGames(missing));
    if (fetched === null) return { games: cached, stale: true };

    await repository.upsertGames(fetched);
    return { games: await repository.getGames(ids), stale: false };
  };

  return {
    search: async (text: string, limit: number): Promise<Stale<{ games: Game[] }>> => {
      const query = normaliseQuery(text);

      const cachedIds = await repository.getCachedSearch(query);
      if (cachedIds !== null) {
        return { games: await repository.getGames(cachedIds.slice(0, limit)), stale: false };
      }

      const local = await repository.searchByName(query, limit);
      if (local.length >= ENOUGH_LOCAL_MATCHES) return { games: local, stale: false };

      const remote = await ask('search', () => igdb.searchGames(query, limit));
      if (remote === null) return { games: local, stale: true };

      await repository.upsertGames(remote);
      await repository.saveSearch(
        query,
        remote.map((game) => game.id),
      );
      const seen = new Set(remote.map((game) => game.id));
      return {
        games: [...remote, ...local.filter((game) => !seen.has(game.id))].slice(0, limit),
        stale: false,
      };
    },

    getGames,

    getGame: async (id: number): Promise<Stale<{ game: Game | null }>> => {
      const { games, stale } = await getGames([id]);
      return { game: games[0] ?? null, stale };
    },

    getReference: async (): Promise<Stale<{ genres: Genre[]; platforms: Platform[] }>> => {
      const cached = await repository.getReference();
      if (cached.fresh) return { genres: cached.genres, platforms: cached.platforms, stale: false };

      const fetched = await ask('reference', async () => ({
        genres: await igdb.getGenres(),
        platforms: await igdb.getPlatforms(),
      }));
      if (fetched === null)
        return { genres: cached.genres, platforms: cached.platforms, stale: true };

      await repository.upsertReference(fetched);
      const { genres, platforms } = await repository.getReference();
      return { genres, platforms, stale: false };
    },
  };
};
