import { createHash, timingSafeEqual } from 'node:crypto';
import { HEADERS } from '@gameplan/contracts';
import type { ErrorResponse, MeResponse } from '@gameplan/contracts';
import { Hono } from 'hono';
import { requireUser } from './auth/middleware';
import { createAuthRoutes } from './auth/routes';
import type { AuthService } from './auth/service';
import { createCatalogRoutes } from './catalog/routes';
import type { CatalogService } from './catalog/service';
import { createCors } from './cors';
import type { Logger } from './logger';

export type AppDependencies = {
  catalog: CatalogService;
  auth: AuthService;
  /** Origins browsers may call from (`CORS_ORIGINS`); empty until the web app exists. */
  corsOrigins: readonly string[];
  logger: Logger;
  /**
   * Required on every `/catalog/*` request. Not a secret: it ships inside the
   * app. It keeps casual scrapers off the IGDB quota, and stays after
   * `auth-identity` (module 7) because search works signed out (decision 4).
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
export const createApp = ({
  catalog,
  auth,
  corsOrigins,
  logger,
  apiKey,
}: AppDependencies): Hono => {
  const app = new Hono();

  app.use('*', createCors(corsOrigins));

  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.use('/catalog/*', async (c, next) => {
    if (!sameKey(c.req.header(HEADERS.apiKey) ?? '', apiKey)) {
      return c.json({ error: 'unauthorized' } satisfies ErrorResponse, 401);
    }
    await next();
  });
  app.route('/catalog', createCatalogRoutes(catalog));
  app.route('/auth', createAuthRoutes(auth));
  app.get('/me', requireUser(auth), async (c) => {
    const me = await auth.me(c.get('user'));
    if (me === null) return c.json({ error: 'unauthorized' } satisfies ErrorResponse, 401);
    return c.json(me satisfies MeResponse);
  });

  // An unexpected error answers with a generic body: an error message can
  // carry details a client should not see. The name is enough for the log.
  app.onError((error, c) => {
    logger.warn(`Unhandled ${error.name} on ${c.req.method} ${c.req.path}`);
    return c.json({ error: 'internal' } satisfies ErrorResponse, 500);
  });

  return app;
};
