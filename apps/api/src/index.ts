import { serve } from '@hono/node-server';
import { createApp } from './app';
import { createConsoleTransport, createResendTransport } from './auth/email';
import { createAuthRepository } from './auth/repository';
import { createAuthService } from './auth/service';
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
const db = createDb(env.DATABASE_URL);
const igdb = createIgdbFromEnv(env, logger);
const catalog = createCatalogService({
  repository: createCatalogRepository(db),
  igdb,
  logger,
});

// readEnv guarantees the key and sender whenever the transport is resend. If
// that ever broke, Resend refuses the send: never a silent fall back to
// printing codes.
const email =
  env.EMAIL_TRANSPORT === 'console'
    ? createConsoleTransport()
    : createResendTransport({ apiKey: env.RESEND_API_KEY ?? '', from: env.EMAIL_FROM ?? '' });
const auth = createAuthService({
  repository: createAuthRepository(db),
  email,
  logger,
  codeSecret: env.CODE_SECRET,
  jwtSecret: env.JWT_SECRET,
  now: () => Date.now(),
});

serve({
  fetch: createApp({
    catalog,
    auth,
    corsOrigins: env.CORS_ORIGINS,
    logger,
    apiKey: env.CATALOG_API_KEY,
  }).fetch,
  port: env.PORT,
});
console.warn(`api listening on http://localhost:${env.PORT}`);
