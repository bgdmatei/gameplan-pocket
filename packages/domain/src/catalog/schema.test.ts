import { describe, expect, it } from 'vitest';
import { gameSchema, genreSchema, platformSchema } from './schema';
import type { Game } from './schema';

const game: Game = {
  id: 1942,
  name: 'The Witcher 3: Wild Hunt',
  slug: 'the-witcher-3-wild-hunt',
  summary: null,
  firstReleaseDate: null,
  coverImageId: null,
  genreIds: [],
  platformIds: [],
};

describe('gameSchema', () => {
  it('accepts a sparse game: IGDB omits plenty of fields', () => {
    expect(gameSchema.safeParse(game).success).toBe(true);
  });

  it('accepts a fully populated game', () => {
    const full: Game = {
      ...game,
      summary: 'A witcher hunts monsters.',
      firstReleaseDate: '2015-05-19',
      coverImageId: 'co1wyy',
      genreIds: [12, 31],
      platformIds: [48, 6],
    };
    expect(gameSchema.safeParse(full).success).toBe(true);
  });

  it.each([
    ['id of zero', { id: 0 }],
    ['fractional id', { id: 1.5 }],
    ['empty name', { name: '' }],
    ['empty slug', { slug: '' }],
    ['release date with a time', { firstReleaseDate: '2015-05-19T00:00:00Z' }],
    ['impossible release date', { firstReleaseDate: '2015-02-30' }],
    ['genre ids that are not numbers', { genreIds: ['rpg'] }],
  ])('rejects %s', (_label, patch) => {
    expect(gameSchema.safeParse({ ...game, ...patch }).success).toBe(false);
  });

  it('rejects unknown fields so a catalog change is noticed', () => {
    expect(gameSchema.safeParse({ ...game, totalRating: 92 }).success).toBe(false);
  });
});

describe('genreSchema', () => {
  it('accepts a genre', () => {
    expect(genreSchema.safeParse({ id: 12, name: 'Role-playing (RPG)', slug: 'rpg' }).success).toBe(
      true,
    );
  });

  it('rejects a genre with no name', () => {
    expect(genreSchema.safeParse({ id: 12, name: '', slug: 'rpg' }).success).toBe(false);
  });
});

describe('platformSchema', () => {
  it('accepts a platform with and without an abbreviation', () => {
    expect(
      platformSchema.safeParse({ id: 48, name: 'PlayStation 5', abbreviation: 'PS5' }).success,
    ).toBe(true);
    expect(
      platformSchema.safeParse({ id: 48, name: 'PlayStation 5', abbreviation: null }).success,
    ).toBe(true);
  });
});
