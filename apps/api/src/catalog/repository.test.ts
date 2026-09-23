import type { Game } from '@gameplan/domain';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../testing/database';
import { createCatalogRepository } from './repository';
import type { CatalogRepository } from './repository';

const game = (id: number, name: string): Game => ({
  id,
  name,
  slug: `game-${id}`,
  summary: null,
  firstReleaseDate: null,
  coverImageId: null,
  genreIds: [],
  platformIds: [],
});

describe('catalog repository', () => {
  let repository: CatalogRepository;

  beforeAll(async () => {
    repository = createCatalogRepository(await createTestDb());
    await repository.upsertGames([
      game(1942, 'The Witcher 3: Wild Hunt'),
      game(478, 'The Witcher 2: Assassins of Kings'),
      game(19560, 'Hunt: Showdown'),
      game(14593, 'Hollow Knight'),
    ]);
  });

  const names = async (query: string): Promise<string[]> =>
    (await repository.searchByName(query, 10)).map((found) => found.name);

  // What people type: part of a title, and sometimes a typo.
  it.each([
    { query: 'witcher 3', finds: 'The Witcher 3: Wild Hunt' },
    { query: 'witchr', finds: 'The Witcher 3: Wild Hunt' },
    { query: 'hollow', finds: 'Hollow Knight' },
  ])('finds "$finds" from "$query", and nothing unrelated', async ({ query, finds }) => {
    const found = await names(query);

    expect(found).toContain(finds);
    expect(found).not.toContain('Hunt: Showdown');
  });

  it('ranks the closer title first', async () => {
    expect(await names('witcher 3')).toEqual([
      'The Witcher 3: Wild Hunt',
      'The Witcher 2: Assassins of Kings',
    ]);
  });
});
