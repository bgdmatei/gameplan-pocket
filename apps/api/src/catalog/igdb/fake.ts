import type { Game, Genre, Platform } from '@gameplan/domain';
import type { IgdbClient } from './client';

export type FakeIgdb = {
  client: IgdbClient;
  /** How many requests reached "IGDB". */
  calls: () => number;
  /** Makes every request fail with `error` until cleared with `null`. */
  failWith: (error: Error | null) => void;
};

/**
 * IGDB for tests: answers from the games it was given, counts requests, and
 * can be told to fail. Search matches every word of the text in the name.
 */
export const createFakeIgdb = (
  games: readonly Game[],
  reference: { genres?: Genre[]; platforms?: Platform[] } = {},
): FakeIgdb => {
  let calls = 0;
  let failure: Error | null = null;

  const answer = async <T>(result: () => T): Promise<T> => {
    calls += 1;
    if (failure !== null) throw failure;
    return result();
  };

  return {
    client: {
      searchGames: (text, limit) => {
        const words = text.toLowerCase().split(/\s+/);
        return answer(() =>
          games
            .filter((game) => words.every((w) => game.name.toLowerCase().includes(w)))
            .slice(0, limit),
        );
      },
      getGames: (ids) => answer(() => games.filter((game) => ids.includes(game.id))),
      getGenres: () => answer(() => reference.genres ?? []),
      getPlatforms: () => answer(() => reference.platforms ?? []),
      getPopularGames: (offset, limit) => answer(() => games.slice(offset, offset + limit)),
    },
    calls: () => calls,
    failWith: (error) => {
      failure = error;
    },
  };
};
