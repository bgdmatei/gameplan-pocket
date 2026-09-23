import type { Game, Genre, Platform } from '@gameplan/domain';
import type { Logger } from '../../logger';
import { mapGames, mapGenres, mapPlatforms } from './map';
import type { Mapped } from './map';
import { gamesByIdQuery, genresQuery, platformsQuery, searchGamesQuery } from './query';
import type { IgdbQuery } from './query';
import type { RateLimitedQueue } from './queue';
import type { TokenSource } from './token';

const IGDB_URL = 'https://api.igdb.com/v4';

/** What the catalog needs from IGDB. The service depends on this, not on `fetch`. */
export type IgdbClient = {
  searchGames: (text: string, limit: number) => Promise<Game[]>;
  getGames: (ids: readonly number[]) => Promise<Game[]>;
  getGenres: () => Promise<Genre[]>;
  getPlatforms: () => Promise<Platform[]>;
};

export type IgdbFailure = 'rate-limited' | 'unavailable' | 'timeout';

/** IGDB could not answer. The catalog serves its cache instead, marked stale. */
export class IgdbError extends Error {
  constructor(readonly failure: IgdbFailure) {
    super(`IGDB request failed: ${failure}.`);
    this.name = 'IgdbError';
  }
}

export type IgdbClientOptions = {
  clientId: string;
  token: TokenSource;
  queue: RateLimitedQueue;
  logger: Logger;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
};

export const createIgdbClient = ({
  clientId,
  token,
  queue,
  logger,
  timeoutMs = 5_000,
  fetch = globalThis.fetch,
}: IgdbClientOptions): IgdbClient => {
  const send = async ({ endpoint, body }: IgdbQuery): Promise<Response> => {
    try {
      return await fetch(`${IGDB_URL}/${endpoint}`, {
        method: 'POST',
        headers: { 'Client-ID': clientId, Authorization: `Bearer ${await token.get()}` },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new IgdbError('timeout');
      }
      throw new IgdbError('unavailable');
    }
  };

  /**
   * One request through the queue. A 401 means the token was revoked or
   * expired early: forget it and try once more, queued again, so the retry
   * counts against the rate limit like any request.
   */
  const post = async (query: IgdbQuery): Promise<unknown> => {
    let response = await queue.run(() => send(query));
    if (response.status === 401) {
      token.invalidate();
      response = await queue.run(() => send(query));
    }

    if (response.status === 429) throw new IgdbError('rate-limited');
    if (!response.ok) throw new IgdbError('unavailable');
    return response.json();
  };

  const reportSkipped = <T>(what: string, mapped: Mapped<T>): T[] => {
    if (mapped.skipped.length > 0) {
      logger.warn(
        `IGDB returned ${mapped.skipped.length} unreadable ${what}: ${mapped.skipped.join(', ')}`,
      );
    }
    return mapped.items;
  };

  return {
    searchGames: async (text, limit) =>
      reportSkipped('games', mapGames(await post(searchGamesQuery(text, limit)))),
    getGames: async (ids) => reportSkipped('games', mapGames(await post(gamesByIdQuery(ids)))),
    getGenres: async () => reportSkipped('genres', mapGenres(await post(genresQuery()))),
    getPlatforms: async () =>
      reportSkipped('platforms', mapPlatforms(await post(platformsQuery()))),
  };
};
