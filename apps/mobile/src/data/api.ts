import {
  HEADERS,
  PROTOCOL_VERSION,
  gameResponseSchema,
  gamesResponseSchema,
  referenceResponseSchema,
} from '@gameplan/contracts';
import type { GameResponse, GamesResponse, ReferenceResponse } from '@gameplan/contracts';

/**
 * Every outcome is a value, never a throw: a screen shows local data first and
 * treats the network as a bonus, so "offline" is as ordinary as "ok".
 */
export type ApiResult<T> =
  | { kind: 'ok'; value: T; stale: boolean }
  /** The game is unknown to the server and to IGDB. */
  | { kind: 'not_found' }
  /** No connection, or the server could not be reached. */
  | { kind: 'offline' }
  /** The server answered with an error, or with something that failed the contract. */
  | { kind: 'failed' }
  /** The caller aborted it, usually because a newer search replaced it. */
  | { kind: 'superseded' };

export type CatalogApiConfig = {
  baseUrl: string;
  apiKey: string;
  appVersion: string;
  fetch?: typeof fetch;
};

type Options = { signal?: AbortSignal };

/** What the client needs from a contract schema; the zod schemas in contracts fit it. */
type Schema<B> = {
  safeParse: (value: unknown) => { success: true; data: B } | { success: false };
};

/**
 * Larger than any real catalog answer (100 games is ~50 KB), so a runaway or
 * hostile body is dropped before it is parsed rather than after.
 */
const MAX_BODY_CHARS = 1_000_000;

const isAbort = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';

export const createCatalogApi = ({
  baseUrl,
  apiKey,
  appVersion,
  fetch = globalThis.fetch,
}: CatalogApiConfig) => {
  const headers = {
    [HEADERS.apiKey]: apiKey,
    [HEADERS.appVersion]: appVersion,
    [HEADERS.protocolVersion]: String(PROTOCOL_VERSION),
  };

  const get = async <B extends { stale: boolean }, T>(
    path: string,
    schema: Schema<B>,
    pick: (body: B) => T,
    { signal }: Options = {},
  ): Promise<ApiResult<T>> => {
    let response: Response;
    let text: string;
    try {
      response = await fetch(`${baseUrl}${path}`, { headers, signal });
      const declared = Number(response.headers.get('content-length') ?? 0);
      if (declared > MAX_BODY_CHARS) return { kind: 'failed' };
      text = await response.text();
    } catch (error) {
      return isAbort(error) ? { kind: 'superseded' } : { kind: 'offline' };
    }

    if (response.status === 404) return { kind: 'not_found' };
    if (!response.ok || text.length > MAX_BODY_CHARS) return { kind: 'failed' };

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { kind: 'failed' };
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) return { kind: 'failed' };
    return { kind: 'ok', value: pick(parsed.data), stale: parsed.data.stale };
  };

  return {
    search: (query: string, options?: Options) =>
      get(
        `/catalog/search?${new URLSearchParams({ q: query }).toString()}`,
        gamesResponseSchema,
        (body: GamesResponse) => body.games,
        options,
      ),
    getGame: (id: number, options?: Options) =>
      get(
        `/catalog/games/${String(id)}`,
        gameResponseSchema,
        (body: GameResponse) => body.game,
        options,
      ),
    getGames: (ids: readonly number[], options?: Options) =>
      get(
        `/catalog/games?ids=${ids.join(',')}`,
        gamesResponseSchema,
        (body: GamesResponse) => body.games,
        options,
      ),
    getReference: (options?: Options) =>
      get(
        '/catalog/reference',
        referenceResponseSchema,
        ({ genres, platforms }: ReferenceResponse) => ({ genres, platforms }),
        options,
      ),
  };
};

export type CatalogApi = ReturnType<typeof createCatalogApi>;
