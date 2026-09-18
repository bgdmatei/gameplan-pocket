import { describe, expect, it } from 'vitest';
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
    const result = starsToRating(3.5);
    expect(result).toEqual({ ok: true, value: 7 });
  });

  it.each([-0.5, 5.5, 2.25])('rejects %f', (stars) => {
    const result = starsToRating(stars);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors[0]).toMatchObject({ code: 'invalid_field', field: 'stars' });
  });

  it('round-trips every rating', () => {
    for (let rating = 0; rating <= 10; rating += 1) {
      expect(starsToRating(ratingToStars(rating))).toEqual({ ok: true, value: rating });
    }
  });
});
