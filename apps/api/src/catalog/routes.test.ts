import {
  errorResponseSchema,
  gameResponseSchema,
  gamesResponseSchema,
  referenceResponseSchema,
} from '@gameplan/contracts';
import type { Game } from '@gameplan/domain';
import type { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createTestDb } from '../testing/database';
import { IgdbError } from './igdb/client';
import { createFakeIgdb } from './igdb/fake';
import type { FakeIgdb } from './igdb/fake';
import { createCatalogRepository } from './repository';
import { createCatalogService } from './service';

const WITCHER_3: Game = {
  id: 1942,
  name: 'The Witcher 3: Wild Hunt',
  slug: 'the-witcher-3-wild-hunt',
  summary: null,
  firstReleaseDate: '2015-05-19',
  coverImageId: 'co1wyy',
  genreIds: [12],
  platformIds: [6],
};

const RPG = { id: 12, name: 'Role-playing (RPG)', slug: 'role-playing-rpg' };
const PC = { id: 6, name: 'PC (Microsoft Windows)', abbreviation: 'PC' };

describe('catalog routes', () => {
  let app: Hono;
  let igdb: FakeIgdb;

  beforeAll(async () => {
    const logger = { warn: () => undefined };
    igdb = createFakeIgdb([WITCHER_3], { genres: [RPG], platforms: [PC] });
    const repository = createCatalogRepository(await createTestDb());
    app = createApp({
      catalog: createCatalogService({ repository, igdb: igdb.client, logger }),
      logger,
    });
  });

  const get = (path: string) => app.request(path);

  it('answers each endpoint in the shape clients parse', async () => {
    // Exact bodies, so nothing beyond the contract leaks out (cache columns,
    // catalog versions); and each parses with the contract clients use.
    const body = async (path: string) => (await get(path)).json();

    const search = await body('/catalog/search?q=witcher');
    expect(search).toEqual({ games: [WITCHER_3], stale: false });
    gamesResponseSchema.parse(search);

    const batch = await body('/catalog/games?ids=1942,1942');
    expect(batch).toEqual({ games: [WITCHER_3], stale: false });

    const single = await body('/catalog/games/1942');
    expect(single).toEqual({ game: WITCHER_3, stale: false });
    gameResponseSchema.parse(single);

    const reference = await body('/catalog/reference');
    expect(reference).toEqual({ genres: [RPG], platforms: [PC], stale: false });
    referenceResponseSchema.parse(reference);

    const missing = await get('/catalog/games/999999');
    expect(missing.status).toBe(404);
    expect(errorResponseSchema.parse(await missing.json()).error).toBe('not_found');
  });

  it.each([
    '/catalog/search',
    '/catalog/search?q=a',
    `/catalog/search?q=${'a'.repeat(101)}`,
    '/catalog/search?q=witcher&limit=0',
    '/catalog/search?q=witcher&limit=many',
    '/catalog/games',
    '/catalog/games?ids=1,x',
    '/catalog/games?ids=-1',
    `/catalog/games?ids=${Array.from({ length: 101 }, (_, i) => i + 1).join(',')}`,
    '/catalog/games/1e3',
    '/catalog/games/abc',
  ])('rejects %s', async (path) => {
    const response = await get(path);

    expect(response.status).toBe(400);
    expect(errorResponseSchema.parse(await response.json()).error).toBe('invalid_request');
  });

  // IGDB being down is not the client's problem: 200, from cache, marked stale.
  it('answers 200 with stale results when IGDB fails', async () => {
    igdb.failWith(new IgdbError('unavailable'));

    const response = await get('/catalog/search?q=hollow knight');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ games: [], stale: true });
    igdb.failWith(null);
  });
});
