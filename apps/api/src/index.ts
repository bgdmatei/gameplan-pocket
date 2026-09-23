import { serve } from '@hono/node-server';
import { createApp } from './app';
import { createIgdbFromEnv } from './catalog/igdb/create';
import { createCatalogRepository } from './catalog/repository';
import { createCatalogService } from './catalog/service';
import { createDb } from './db/client';
import { loadDotEnv, readEnv } from './env';
import { consoleLogger } from './logger';

// Refuses to start without its configuration, naming what is missing.
loadDotEnv();
const env = readEnv(process.env);

const logger = consoleLogger;
const igdb = createIgdbFromEnv(env, logger);
const catalog = createCatalogService({
  repository: createCatalogRepository(createDb(env.DATABASE_URL)),
  igdb,
  logger,
});

serve({ fetch: createApp({ catalog, logger }).fetch, port: env.PORT });
console.warn(`api listening on http://localhost:${env.PORT}`);
