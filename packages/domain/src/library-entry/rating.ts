import { z } from 'zod';
import { DomainValidationError } from '../shared/errors';

export const ratingSchema = z.number().int().min(0).max(100).nullable();

export type Rating = z.infer<typeof ratingSchema>;

const PER_STAR = 20;

export const ratingToStars = (rating: number): number => rating / PER_STAR;

/** @throws {DomainValidationError} when `stars` isn't 0-5 in half steps. */
export const starsToRating = (stars: number): number => {
  if (!Number.isInteger(stars * 2) || stars < 0 || stars > 5) {
    throw new DomainValidationError([
      {
        code: 'invalid_field',
        field: 'stars',
        message: 'Stars must be between 0 and 5 in half steps.',
      },
    ]);
  }
  return stars * PER_STAR;
};
