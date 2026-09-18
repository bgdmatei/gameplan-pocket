import { z } from 'zod';
import { isoDateSchema, isoDateTimeSchema } from '../shared/date';
import { playtimeMinutesSchema } from './playtime';
import { progressSchema } from './progress';
import { ratingSchema } from './rating';
import { entryStatusSchema } from './status';

/**
 * One game in the user's library. At most one entry per game, so a status or
 * rating change shows up everywhere that game appears.
 *
 * `userId` and `deleted` are deliberately absent: scoping belongs to the
 * server and tombstones belong to `sync-core`.
 */
export const libraryEntrySchema = z
  .object({
    id: z.string().min(1),
    gameId: z.number().int().positive(),
    status: entryStatusSchema,
    rating: ratingSchema,
    platformId: z.number().int().positive().nullable(),
    progress: progressSchema.nullable(),
    playtimeMinutes: playtimeMinutesSchema,
    startedOn: isoDateSchema.nullable(),
    finishedOn: isoDateSchema.nullable(),
    favourite: z.boolean(),
    createdAt: isoDateTimeSchema,
  })
  .strict();

export type LibraryEntry = z.infer<typeof libraryEntrySchema>;

/**
 * Shape check for the merge path. Cross-field rules (finishedOn >= startedOn)
 * and status transitions are NOT checked here: per-field LWW can produce
 * combinations no local write would allow, and rejecting them during a merge
 * would stop devices converging (SPEC-domain-model.md §Merge safety).
 */
export const isWellFormed = (value: unknown): boolean =>
  libraryEntrySchema.safeParse(value).success;
