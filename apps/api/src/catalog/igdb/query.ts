/**
 * Every IGDB request body is built here (Apicalypse). Nothing else writes
 * query text, so there is one place to get quoting right.
 */
export type IgdbQuery = { endpoint: 'games' | 'genres' | 'platforms'; body: string };

const GAME_FIELDS = 'name,slug,summary,first_release_date,cover.image_id,genres,platforms';

/** IGDB's largest page. */
export const IGDB_MAX_LIMIT = 500;

/**
 * Makes user text safe inside an Apicalypse string. Quotes and backslashes are
 * removed rather than escaped: removal cannot be undone by however the parser
 * treats escapes, and game titles almost never contain either. Control
 * characters become spaces.
 */
export const toSearchTerm = (text: string): string =>
  Array.from(text, (char) => {
    if (char === '"' || char === '\\') return '';
    const code = char.charCodeAt(0);
    return code < 0x20 || code === 0x7f ? ' ' : char;
  })
    .join('')
    .trim();

export const searchGamesQuery = (text: string, limit: number): IgdbQuery => ({
  endpoint: 'games',
  body: `search "${toSearchTerm(text)}"; fields ${GAME_FIELDS}; limit ${limit};`,
});

/** One request for many ids, rather than one per game. */
export const gamesByIdQuery = (ids: readonly number[]): IgdbQuery => {
  if (ids.length === 0 || ids.length > IGDB_MAX_LIMIT) {
    throw new Error(`Between 1 and ${IGDB_MAX_LIMIT} ids per request, got ${ids.length}.`);
  }
  if (!ids.every((id) => Number.isSafeInteger(id) && id > 0)) {
    throw new Error('Game ids must be positive integers.');
  }
  return {
    endpoint: 'games',
    body: `fields ${GAME_FIELDS}; where id = (${ids.join(',')}); limit ${ids.length};`,
  };
};

/**
 * The most-rated games, a page at a time: what people actually own, for the
 * storage seed fixture. Rated by enough people to be real, not placeholders.
 */
export const popularGamesQuery = (offset: number, limit: number): IgdbQuery => ({
  endpoint: 'games',
  body: `fields ${GAME_FIELDS}; where total_rating_count > 20; sort total_rating_count desc; limit ${limit}; offset ${offset};`,
});

export const genresQuery = (): IgdbQuery => ({
  endpoint: 'genres',
  body: `fields name,slug; limit ${IGDB_MAX_LIMIT};`,
});

export const platformsQuery = (): IgdbQuery => ({
  endpoint: 'platforms',
  body: `fields name,abbreviation; limit ${IGDB_MAX_LIMIT};`,
});
