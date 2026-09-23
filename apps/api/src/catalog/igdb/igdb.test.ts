import { describe, expect, it } from 'vitest';
import sample from '../fixtures/igdb-games.sample.json';
import { mapGames } from './map';
import { searchGamesQuery } from './query';

describe('IGDB queries', () => {
  // The attack: search text that tries to close the search clause and add
  // its own (every field, a different filter) stays one quoted term.
  it('keeps search text inside its own search clause', () => {
    const { body } = searchGamesQuery('witcher"; fields *; where id = 1; \\', 20);

    expect(body).toBe(
      'search "witcher; fields *; where id = 1;"; ' +
        'fields name,slug,summary,first_release_date,cover.image_id,genres,platforms; limit 20;',
    );
  });
});

describe('IGDB mapping', () => {
  // A hand-written sample in IGDB's response shape; T9 checks real responses.
  it('maps games to the domain shape, and leaves out one it cannot read', () => {
    const { items, skipped } = mapGames(sample);

    expect(items).toEqual([
      {
        id: 1942,
        name: 'The Witcher 3: Wild Hunt',
        slug: 'the-witcher-3-wild-hunt',
        summary: 'RPG and sequel to The Witcher 2.',
        firstReleaseDate: '2015-05-19',
        coverImageId: 'co1wyy',
        genreIds: [12, 31],
        platformIds: [6, 48, 49, 130],
      },
      {
        id: 119133,
        name: 'Untitled Prototype',
        slug: 'untitled-prototype',
        summary: null,
        firstReleaseDate: null,
        coverImageId: null,
        genreIds: [],
        platformIds: [],
      },
    ]);
    expect(skipped).toEqual([5]);
  });
});
