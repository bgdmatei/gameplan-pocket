import { z } from 'zod';
import { DomainValidationError } from '../shared/errors';

/**
 * Stored as an integer 0-10; `null` means unrated. The UI shows 5 stars in
 * half steps. Plan §4 stores 0-100 — `schema-evolution` migrates to that as
 * its breaking change (SPEC-domain-model.md §Rating display).
 */
export const ratingSchema = z.number().int().min(0).max(10).nullable();

export type Rating = z.infer<typeof ratingSchema>;

export const ratingToStars = (rating: number): number => rating / 2;

/** @throws {DomainValidationError} when `stars` isn't 0-5 in half steps. */
export const starsToRating = (stars: number): number => {
  const rating = stars * 2;
  if (!Number.isInteger(rating) || rating < 0 || rating > 10) {
    throw new DomainValidationError([
      {
        code: 'invalid_field',
        field: 'stars',
        message: 'Stars must be between 0 and 5 in half steps.',
      },
    ]);
  }
  return rating;
};
