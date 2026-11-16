import type { Game } from '@gameplan/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../testing/database';
import { IgdbError } from './igdb/client';
import { createFakeIgdb } from './igdb/fake';
import type { FakeIgdb } from './igdb/fake';
import { QueueFullError } from './igdb/queue';
import { createCatalogRepository } from './repository';
import type { CatalogRepository } from './repository';
import { createCatalogService } from './service';
import type { CatalogService } from './service';

const game = (id: number, name: string): Game => ({
  id,
  name,
  slug: `game-${id}`,
  summary: null,
  firstReleaseDate: null,
  coverImageId: null,
  genreIds: [],
  platformIds: [],
  developer: null,
});

const WITCHER_3 = game(1942, 'The Witcher 3: Wild Hunt');
const WITCHER_2 = game(478, 'The Witcher 2: Assassins of Kings');
const HOLLOW_KNIGHT = game(14593, 'Hollow Knight');

describe('catalog service', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let repository: CatalogRepository;
  let igdb: FakeIgdb;
  let service: CatalogService;

  beforeEach(async () => {
    db = await createTestDb();
    repository = createCatalogRepository(db);
    igdb = createFakeIgdb([WITCHER_3, WITCHER_2, HOLLOW_KNIGHT]);
    service = createCatalogService({ repository, igdb: igdb.client, logger: { warn: () => {} } });
  });

  it('asks IGDB once for a new search, and answers a repeat from the cache', async () => {
    const first = await service.search('  Witcher ', 20);
    const repeat = await service.search('witcher', 20);

    expect(igdb.calls()).toBe(1);
    expect(repeat).toEqual(first);
    expect(first).toEqual({ games: [WITCHER_3, WITCHER_2], stale: false });
  });

  // IGDB failing in any way must not fail the client: it gets what the cache
  // has, told that it may be out of date.
  it.each([
    { failure: new IgdbError('rate-limited') },
    { failure: new IgdbError('unavailable') },
    { failure: new IgdbError('timeout') },
    { failure: new QueueFullError() },
  ])(
    'serves the cache, marked stale, when IGDB fails with $failure.message',
    async ({ failure }) => {
      await repository.upsertGames([WITCHER_3]);
      igdb.failWith(failure);

      expect(await service.search('witcher', 20)).toEqual({ games: [WITCHER_3], stale: true });
      expect(await service.getGames([WITCHER_3.id, HOLLOW_KNIGHT.id])).toEqual({
        games: [WITCHER_3],
        stale: true,
      });
    },
  );

  it('fetches only the missing games, in one request', async () => {
    await repository.upsertGames([WITCHER_3]);
    const getGames = vi.spyOn(igdb.client, 'getGames');

    const result = await service.getGames([WITCHER_3.id, WITCHER_2.id, HOLLOW_KNIGHT.id]);

    expect(getGames).toHaveBeenCalledTimes(1);
    expect(getGames).toHaveBeenCalledWith([WITCHER_2.id, HOLLOW_KNIGHT.id]);
    expect(result).toEqual({ games: [WITCHER_3, WITCHER_2, HOLLOW_KNIGHT], stale: false });
  });

  // A row cached before the developer was asked for would otherwise never
  // get one. Proven by dropping the outdated check from getGames.
  it('fetches a cached game again when it predates the current IGDB fields', async () => {
    await repository.upsertGames([{ ...WITCHER_3, developer: null }]);
    await db.updateTable('games').set({ catalog_fields: 0 }).execute();
    igdb = createFakeIgdb([{ ...WITCHER_3, developer: 'CD Projekt RED' }]);
    service = createCatalogService({ repository, igdb: igdb.client, logger: { warn: () => {} } });

    const first = await service.getGames([WITCHER_3.id]);
    const again = await service.getGames([WITCHER_3.id]);

    expect(first.games[0]?.developer).toBe('CD Projekt RED');
    expect(again.games[0]?.developer).toBe('CD Projekt RED');
    expect(igdb.calls()).toBe(1);
  });
});
