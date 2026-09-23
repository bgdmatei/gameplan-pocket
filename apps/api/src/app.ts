import type { ErrorResponse } from '@gameplan/contracts';
import { Hono } from 'hono';
import { createCatalogRoutes } from './catalog/routes';
import type { CatalogService } from './catalog/service';
import type { Logger } from './logger';

export type AppDependencies = { catalog: CatalogService; logger: Logger };

/** The HTTP app, given its dependencies: the server wires real ones, tests fakes. */
export const createApp = ({ catalog, logger }: AppDependencies): Hono => {
  const app = new Hono();

  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.route('/catalog', createCatalogRoutes(catalog));

  // An unexpected error answers with a generic body: an error message can
  // carry details a client should not see. The name is enough for the log.
  app.onError((error, c) => {
    logger.warn(`Unhandled ${error.name} on ${c.req.method} ${c.req.path}`);
    return c.json({ error: 'internal' } satisfies ErrorResponse, 500);
  });

  return app;
};
