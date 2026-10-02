import { createHash, timingSafeEqual } from 'node:crypto';
import { HEADERS } from '@gameplan/contracts';
import type { ErrorResponse } from '@gameplan/contracts';
import { Hono } from 'hono';
import { createCatalogRoutes } from './catalog/routes';
import type { CatalogService } from './catalog/service';
import type { Logger } from './logger';

export type AppDependencies = {
  catalog: CatalogService;
  logger: Logger;
  /**
   * Required on every `/catalog/*` request. Not a secret: it ships inside the
   * app. It keeps casual scrapers off the IGDB quota until real auth arrives
   * in `auth-identity` (module 7).
   */
  apiKey: string;
};

/**
 * Compares digests rather than the strings, so the comparison takes the same
 * time whatever the input's length or how much of it matches.
 */
const sameKey = (given: string, expected: string): boolean => {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
};

/** The HTTP app, given its dependencies: the server wires real ones, tests fakes. */
export const createApp = ({ catalog, logger, apiKey }: AppDependencies): Hono => {
  const app = new Hono();

  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.use('/catalog/*', async (c, next) => {
    if (!sameKey(c.req.header(HEADERS.apiKey) ?? '', apiKey)) {
      return c.json({ error: 'unauthorized' } satisfies ErrorResponse, 401);
    }
    await next();
  });
  app.route('/catalog', createCatalogRoutes(catalog));

  // An unexpected error answers with a generic body: an error message can
  // carry details a client should not see. The name is enough for the log.
  app.onError((error, c) => {
    logger.warn(`Unhandled ${error.name} on ${c.req.method} ${c.req.path}`);
    return c.json({ error: 'internal' } satisfies ErrorResponse, 500);
  });

  return app;
};
