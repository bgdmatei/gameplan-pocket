import { z } from 'zod';
import { isoDateSchema } from '../shared/date';

/**
 * Catalog data is read-only here: IGDB is the source of truth, the server
 * caches it, and clients only ever read it (SPEC-domain-model.md
 * §Catalog and library). Fields IGDB often omits are nullable.
 */
export const gameSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    slug: z.string().min(1),
    summary: z.string().nullable(),
    firstReleaseDate: isoDateSchema.nullable(),
    coverImageId: z.string().min(1).nullable(),
    genreIds: z.array(z.number().int().positive()),
    platformIds: z.array(z.number().int().positive()),
  })
  .strict();

export type Game = z.infer<typeof gameSchema>;

export const genreSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    slug: z.string().min(1),
  })
  .strict();

export type Genre = z.infer<typeof genreSchema>;

export const platformSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    abbreviation: z.string().min(1).nullable(),
  })
  .strict();

export type Platform = z.infer<typeof platformSchema>;
