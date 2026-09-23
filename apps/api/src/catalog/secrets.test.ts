import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { Logger } from '../logger';
import { createTestDb } from '../testing/database';
import { createIgdbClient } from './igdb/client';
import { createRateLimitedQueue } from './igdb/queue';
import { createTwitchToken } from './igdb/token';
import { createCatalogRepository } from './repository';
import { createCatalogService } from './service';

const SECRET = 'test-secret-3f9a2c1b';

/**
 * Worst case: Twitch and IGDB both answer errors that echo the secret back.
 * Every log line and every response body must still be free of it.
 */
const setup = async (answer: (url: string) => Response) => {
  const lines: string[] = [];
  const logger: Logger = { warn: (message) => lines.push(message) };
  const fetch = async (input: string | URL | Request): Promise<Response> => answer(String(input));

  const token = createTwitchToken({ clientId: 'id', clientSecret: SECRET, now: Date.now, fetch });
  const igdb = createIgdbClient({
    clientId: 'id',
    token,
    queue: createRateLimitedQueue({ perSecond: 100, maxInFlight: 8, maxWaiting: 20 }),
    logger,
    fetch,
  });
  const db = await createTestDb();
  const catalog = createCatalogService({ repository: createCatalogRepository(db), igdb, logger });
  return { app: createApp({ catalog, logger }), lines, db };
};

const echoSecret = (status: number) =>
  Response.json({ message: `bad credentials: ${SECRET}` }, { status });

describe('the Twitch secret', () => {
  it.each([
    { case: 'Twitch rejects the credentials', answer: () => echoSecret(403) },
    {
      case: 'IGDB fails',
      answer: (url: string) =>
        url.includes('twitch')
          ? Response.json({ access_token: 'token', expires_in: 3_600 })
          : echoSecret(500),
    },
  ])('never reaches a log or a response when $case', async ({ answer }) => {
    const { app, lines } = await setup(answer);

    const bodies = await Promise.all(
      ['/catalog/search?q=witcher', '/catalog/games/1942', '/catalog/reference'].map(async (path) =>
        (await app.request(path)).text(),
      ),
    );

    expect(lines.length).toBeGreaterThan(0);
    expect([...lines, ...bodies].join('\n')).not.toContain(SECRET);
  });

  it('stays out of the answer to an unexpected error', async () => {
    const { app, lines, db } = await setup(() => echoSecret(500));
    await db.destroy();

    const response = await app.request('/catalog/search?q=witcher');

    expect(response.status).toBe(500);
    expect([...lines, await response.text()].join('\n')).not.toContain(SECRET);
  });
});
