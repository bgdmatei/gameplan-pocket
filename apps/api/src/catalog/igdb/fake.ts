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
 * can be told to fail. Search matches whole words, as IGDB's does; finding by
 * name matches the text anywhere in it.
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
        const words = text
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter(Boolean);
        return answer(() =>
          games
            .filter((game) => {
              const named = game.name.toLowerCase().split(/[^a-z0-9]+/);
              return words.every((word) => named.includes(word));
            })
            .slice(0, limit),
        );
      },
      findGamesByName: (text, limit) =>
        answer(() =>
          games
            .filter((game) => game.name.toLowerCase().includes(text.toLowerCase()))
            .slice(0, limit),
        ),
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
