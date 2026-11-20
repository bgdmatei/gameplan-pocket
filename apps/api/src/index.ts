import { serve } from '@hono/node-server';
import { createApp } from './app';
import { createConsoleTransport, createResendTransport } from './auth/email';
import { createAuthRepository } from './auth/repository';
import { createAuthService } from './auth/service';
import { createIgdbFromEnv } from './catalog/igdb/create';
import { createCatalogRepository } from './catalog/repository';
import { createCatalogService } from './catalog/service';
import { createDb } from './db/client';
import { assertAppRole } from './db/roles';
import { loadDotEnv, readEnv } from './env';
import { consoleLogger } from './logger';
import { createPokeHub } from './sync/events/hub';
import { createPokeListener } from './sync/events/listener';
import { createSyncRepository } from './sync/repository';
import { createSyncService } from './sync/service';

// Refuses to start without its configuration, naming what is missing.
loadDotEnv();
const env = readEnv(process.env);

const logger = consoleLogger;
const db = createDb(env.DATABASE_URL);
try {
  await assertAppRole(db);
  if (env.LISTEN_DATABASE_URL !== undefined) {
    const listenDb = createDb(env.LISTEN_DATABASE_URL);
    try {
      await assertAppRole(listenDb, 'LISTEN_DATABASE_URL');
    } finally {
      await listenDb.destroy();
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'The database role check failed.');
  await db.destroy();
  process.exit(1);
}
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

const sync = createSyncService({
  repository: createSyncRepository(db),
  logger,
  now: () => Date.now(),
});

const pokes = createPokeHub();
const listener = createPokeListener({
  connectionString: env.LISTEN_DATABASE_URL ?? env.DATABASE_URL,
  hub: pokes,
  logger,
  currentSeq: sync.lastSeq,
});
try {
  await listener.start();
} catch (error) {
  console.error(
    `The poke listener could not start: ${error instanceof Error ? error.name : 'unknown'}.`,
  );
  await db.destroy();
  process.exit(1);
}

serve({
  fetch: createApp({
    catalog,
    auth,
    sync,
    pokes,
    corsOrigins: env.CORS_ORIGINS,
    logger,
    apiKey: env.CATALOG_API_KEY,
  }).fetch,
  port: env.PORT,
});
console.warn(`api listening on http://localhost:${env.PORT}`);
