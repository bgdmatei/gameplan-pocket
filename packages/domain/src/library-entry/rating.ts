import { z } from 'zod';
import { fail, ok } from '../shared/result';
import type { Result } from '../shared/result';

/**
 * Stored as an integer 0-10; `null` means unrated. The UI shows 5 stars in
 * half steps. Plan §4 stores 0-100 — `schema-evolution` migrates to that as
 * its breaking change (SPEC-domain-model.md §Rating display).
 */
export const ratingSchema = z.number().int().min(0).max(10).nullable();

export type Rating = z.infer<typeof ratingSchema>;

export const ratingToStars = (rating: number): number => rating / 2;

export const starsToRating = (stars: number): Result<number> => {
  const rating = stars * 2;
  if (!Number.isInteger(rating) || rating < 0 || rating > 10) {
    return fail({
      code: 'invalid_field',
      field: 'stars',
      message: 'Stars must be between 0 and 5 in half steps.',
    });
  }
  return ok(rating);
};
