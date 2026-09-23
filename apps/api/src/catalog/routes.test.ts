import { gameSchema, genreSchema, platformSchema } from '@gameplan/domain';
import type { Game } from '@gameplan/domain';
import type { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
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

// What a client parses: the domain's own schemas, plus the stale flag.
const gamesResponse = z.object({ games: z.array(gameSchema), stale: z.boolean() }).strict();

describe('catalog routes', () => {
  let app: Hono;
  let igdb: FakeIgdb;

  beforeAll(async () => {
    const logger = { warn: () => undefined };
    igdb = createFakeIgdb([WITCHER_3], {
      genres: [{ id: 12, name: 'Role-playing (RPG)', slug: 'role-playing-rpg' }],
      platforms: [{ id: 6, name: 'PC (Microsoft Windows)', abbreviation: 'PC' }],
    });
    const repository = createCatalogRepository(await createTestDb());
    app = createApp({
      catalog: createCatalogService({ repository, igdb: igdb.client, logger }),
      logger,
    });
  });

  const get = (path: string) => app.request(path);

  it('answers each endpoint in the shape clients parse', async () => {
    const search = await get('/catalog/search?q=witcher');
    expect(gamesResponse.parse(await search.json()).games).toEqual([WITCHER_3]);

    const batch = await get('/catalog/games?ids=1942,1942');
    expect(gamesResponse.parse(await batch.json()).games).toEqual([WITCHER_3]);

    const single = await get('/catalog/games/1942');
    expect(await single.json()).toEqual({ game: WITCHER_3, stale: false });

    const reference = await get('/catalog/reference');
    z.object({
      genres: z.array(genreSchema).min(1),
      platforms: z.array(platformSchema).min(1),
      stale: z.boolean(),
    })
      .strict()
      .parse(await reference.json());

    expect((await get('/catalog/games/999999')).status).toBe(404);
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
    expect(await response.json()).toMatchObject({ error: 'invalid_request' });
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
