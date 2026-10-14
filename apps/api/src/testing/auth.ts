import type { Hono } from 'hono';
import type { Kysely } from 'kysely';
import { createApp } from '../app';
import type { EmailTransport } from '../auth/email';
import { createAuthRepository } from '../auth/repository';
import type { AuthRepository } from '../auth/repository';
import { createAuthService } from '../auth/service';
import type { AuthService } from '../auth/service';
import { createFakeIgdb } from '../catalog/igdb/fake';
import { createCatalogRepository } from '../catalog/repository';
import { createCatalogService } from '../catalog/service';
import type { Database } from '../db/schema';
import { createTestDb } from './database';

export const TEST_SECRETS = { jwt: 'j'.repeat(32), code: 'c'.repeat(32) } as const;
export const TEST_API_KEY = 'test-api-key-0123456789';

export type SentCode = { to: string; code: string };

export type TestAuth = {
  db: Kysely<Database>;
  repository: AuthRepository;
  auth: AuthService;
  /** Every code the transport was asked to send, in order. */
  sent: SentCode[];
  /** Every line logged, to prove nothing private reaches a log. */
  logs: string[];
  /** The service's clock; starts at a fixed instant and moves only when told. */
  clock: { now: () => number; advance: (ms: number) => void };
};

/** An auth service on its own fresh database, with a recording email transport. */
export const createTestAuth = async (db?: Kysely<Database>): Promise<TestAuth> => {
  const database = db ?? (await createTestDb());
  const sent: SentCode[] = [];
  const logs: string[] = [];
  let time = Date.parse('2026-10-09T10:00:00Z');
  const clock = { now: () => time, advance: (ms: number) => void (time += ms) };

  const email: EmailTransport = {
    sendCode: async (to, code) => {
      sent.push({ to, code });
    },
  };
  const repository = createAuthRepository(database);
  const auth = createAuthService({
    repository,
    email,
    logger: { warn: (line) => logs.push(line) },
    codeSecret: TEST_SECRETS.code,
    now: clock.now,
  });
  return { db: database, repository, auth, sent, logs, clock };
};

/** The whole app over a test auth service, with an empty fake catalog. */
export const createTestApp = async (): Promise<TestAuth & { app: Hono }> => {
  const testAuth = await createTestAuth();
  const logger = { warn: (line: string) => testAuth.logs.push(line) };
  const igdb = createFakeIgdb([], { genres: [], platforms: [] });
  const catalog = createCatalogService({
    repository: createCatalogRepository(testAuth.db),
    igdb: igdb.client,
    logger,
  });
  const app = createApp({ catalog, auth: testAuth.auth, logger, apiKey: TEST_API_KEY });
  return { ...testAuth, app };
};

/** A JSON POST against the app, as a client sends it. */
export const post = (app: Hono, path: string, body: unknown): Promise<Response> | Response =>
  app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
