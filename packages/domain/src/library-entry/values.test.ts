import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../shared/errors';
import { hoursMinutesToMinutes, minutesToHoursMinutes } from './playtime';
import { ratingToStars, starsToRating } from './rating';
import { isWellFormed } from './schema';

const entry = {
  id: 'entry-1',
  gameId: 1942,
  status: 'playing',
  rating: null,
  platformId: null,
  progress: null,
  playtimeMinutes: 0,
  startedOn: null,
  finishedOn: null,
  favourite: false,
  createdAt: '2026-09-18T10:00:00Z',
};

describe('rating and stars', () => {
  it('round-trips, and refuses anything that is not a half step', () => {
    for (let rating = 0; rating <= 10; rating += 1) {
      expect(starsToRating(ratingToStars(rating))).toBe(rating);
    }
    expect(() => starsToRating(2.25)).toThrow(DomainValidationError);
    expect(() => starsToRating(5.5)).toThrow(DomainValidationError);
  });
});

describe('playtime', () => {
  it('round-trips hours and minutes, and refuses 60 minutes', () => {
    expect(hoursMinutesToMinutes(minutesToHoursMinutes(135))).toBe(135);
    expect(() => hoursMinutesToMinutes({ hours: 1, minutes: 60 })).toThrow(DomainValidationError);
  });
});

describe('isWellFormed', () => {
  /**
   * The merge path's only check. It must accept states a local write would
   * reject, because per-field last-write-wins produces them and rejecting one
   * would stop devices converging.
   */
  it('accepts merge-produced states a local write would never allow', () => {
    expect(isWellFormed({ ...entry, status: 'dropped', finishedOn: '2026-03-04' })).toBe(true);
    expect(isWellFormed({ ...entry, startedOn: '2026-05-05', finishedOn: '2026-01-01' })).toBe(
      true,
    );
  });

  it('rejects a row that is not an entry at all', () => {
    expect(isWellFormed({ ...entry, status: 'finished' })).toBe(false);
    expect(isWellFormed(null)).toBe(false);
  });
});
