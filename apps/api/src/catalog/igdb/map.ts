import { gameSchema, genreSchema, platformSchema } from '@gameplan/domain';
import type { Game, Genre, Platform } from '@gameplan/domain';
import { z } from 'zod';

/** The parts of an IGDB game we ask for. IGDB omits a field rather than send null. */
const igdbGameSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  slug: z.string(),
  summary: z.string().optional(),
  /** Unix seconds. */
  first_release_date: z.number().int().optional(),
  cover: z.object({ image_id: z.string() }).optional(),
  genres: z.array(z.number().int()).optional(),
  platforms: z.array(z.number().int()).optional(),
});

const igdbGenreSchema = z.object({ id: z.number().int(), name: z.string(), slug: z.string() });

const igdbPlatformSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  abbreviation: z.string().optional(),
});

/** The calendar day in UTC, which is how IGDB records release dates. */
const toIsoDate = (unixSeconds: number): string =>
  new Date(unixSeconds * 1000).toISOString().slice(0, 10);

export type Mapped<T> = {
  items: T[];
  /** Ids (where readable) of records that failed to parse and were left out. */
  skipped: unknown[];
};

/**
 * Maps a raw IGDB response, one record at a time. A malformed record is left
 * out and reported rather than failing the whole response: one bad game must
 * not hide nineteen good ones. Every kept record passes the domain schema,
 * so nothing reaches the cache that a client would reject.
 */
const mapEach = <T>(raw: unknown, toItem: (record: unknown) => T | null): Mapped<T> => {
  const records = Array.isArray(raw) ? raw : [];
  const mapped: Mapped<T> = { items: [], skipped: [] };

  for (const record of records) {
    const item = toItem(record);
    if (item === null) mapped.skipped.push((record as { id?: unknown } | null)?.id);
    else mapped.items.push(item);
  }
  return mapped;
};

export const mapGames = (raw: unknown): Mapped<Game> =>
  mapEach(raw, (record) => {
    const igdb = igdbGameSchema.safeParse(record);
    if (!igdb.success) return null;

    const { data } = igdb;
    const game = gameSchema.safeParse({
      id: data.id,
      name: data.name,
      slug: data.slug,
      summary: data.summary ?? null,
      firstReleaseDate:
        data.first_release_date === undefined ? null : toIsoDate(data.first_release_date),
      coverImageId: data.cover?.image_id ?? null,
      genreIds: data.genres ?? [],
      platformIds: data.platforms ?? [],
    });
    return game.success ? game.data : null;
  });

export const mapGenres = (raw: unknown): Mapped<Genre> =>
  mapEach(raw, (record) => {
    const parsed = genreSchema.safeParse(igdbGenreSchema.safeParse(record).data);
    return parsed.success ? parsed.data : null;
  });

export const mapPlatforms = (raw: unknown): Mapped<Platform> =>
  mapEach(raw, (record) => {
    const igdb = igdbPlatformSchema.safeParse(record);
    if (!igdb.success) return null;
    const parsed = platformSchema.safeParse({
      ...igdb.data,
      abbreviation: igdb.data.abbreviation ?? null,
    });
    return parsed.success ? parsed.data : null;
  });
