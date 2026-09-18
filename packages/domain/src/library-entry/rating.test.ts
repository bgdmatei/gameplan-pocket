import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../shared/errors';
import { ratingSchema, ratingToStars, starsToRating } from './rating';

describe('ratingSchema', () => {
  it.each([0, 5, 10, null])('accepts %s', (value) => {
    expect(ratingSchema.safeParse(value).success).toBe(true);
  });

  it.each([-1, 11, 7.5, '7', undefined])('rejects %s', (value) => {
    expect(ratingSchema.safeParse(value).success).toBe(false);
  });
});

describe('ratingToStars', () => {
  it.each([
    [0, 0],
    [1, 0.5],
    [5, 2.5],
    [9, 4.5],
    [10, 5],
  ])('maps %i to %f stars', (rating, stars) => {
    expect(ratingToStars(rating)).toBe(stars);
  });
});

describe('starsToRating', () => {
  it('converts valid half-steps', () => {
    expect(starsToRating(3.5)).toBe(7);
  });

  it.each([-0.5, 5.5, 2.25])('throws for %f', (stars) => {
    expect(() => starsToRating(stars)).toThrow(DomainValidationError);
    try {
      starsToRating(stars);
    } catch (error) {
      expect((error as DomainValidationError).errors[0]).toMatchObject({
        code: 'invalid_field',
        field: 'stars',
      });
    }
  });

  it('round-trips every rating', () => {
    for (let rating = 0; rating <= 10; rating += 1) {
      expect(starsToRating(ratingToStars(rating))).toBe(rating);
    }
  });
});
