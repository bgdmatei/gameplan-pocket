import { gameSchema, genreSchema, platformSchema } from '@gameplan/domain';
import { z } from 'zod';

/** Request bounds the API enforces, so a client never sends what it would refuse. */
export const CATALOG_LIMITS = {
  queryMinLength: 2,
  queryMaxLength: 100,
  searchDefaultLimit: 20,
  searchMaxLimit: 50,
  batchMaxIds: 100,
} as const;

/*
 * On the wire, catalog values use the domain's fields but not its strictness:
 * a field a newer server adds is dropped by an older client rather than
 * failing the whole response (plan §11, additive changes). What survives is
 * exactly the domain's shape, so the client stores it through the strict
 * domain schema as usual.
 */
const wireGame = z.object(gameSchema.shape);
const wireGenre = z.object(genreSchema.shape);
const wirePlatform = z.object(platformSchema.shape);

/** `stale: true` means IGDB could not be reached and this came from the cache. */
const stale = z.boolean();

/** `GET /catalog/search` and `GET /catalog/games?ids=` */
export const gamesResponseSchema = z.object({ games: z.array(wireGame), stale });
export type GamesResponse = z.infer<typeof gamesResponseSchema>;

/** `GET /catalog/games/:id` */
export const gameResponseSchema = z.object({ game: wireGame, stale });
export type GameResponse = z.infer<typeof gameResponseSchema>;

/** `GET /catalog/reference` */
export const referenceResponseSchema = z.object({
  genres: z.array(wireGenre),
  platforms: z.array(wirePlatform),
  stale,
});
export type ReferenceResponse = z.infer<typeof referenceResponseSchema>;

/** Every error body. Validation errors name the fields, never what was sent. */
export const errorResponseSchema = z.discriminatedUnion('error', [
  z.object({ error: z.literal('invalid_request'), fields: z.array(z.string()) }),
  z.object({ error: z.literal('not_found'), stale }),
  z.object({ error: z.literal('unauthorized') }),
  // Wrong, expired, burned or over the daily cap alike: which rule refused a
  // code is not told, so guessing learns nothing (SPEC-auth-identity.md).
  z.object({ error: z.literal('invalid_code') }),
  // `/auth/verify` with a node id another account registered.
  z.object({ error: z.literal('device_conflict') }),
  z.object({ error: z.literal('internal') }),
]);
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
