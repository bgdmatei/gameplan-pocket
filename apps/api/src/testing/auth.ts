import { verifyResponseSchema } from '@gameplan/contracts';
import type { VerifyResponse } from '@gameplan/contracts';
import type { Hono } from 'hono';
import type { Kysely } from 'kysely';
import { vi } from 'vitest';
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
  /** The service's clock; starts at the real time and moves only when told. */
  clock: { now: () => number; advance: (ms: number) => void };
};

export type TestAuthOptions = {
  /** Runs after a send is recorded, as the real transport would; may throw to fail it. */
  afterSend?: EmailTransport['sendCode'];
};

/** An auth service on its own fresh database, with a recording email transport. */
export const createTestAuth = async (
  db?: Kysely<Database>,
  { afterSend }: TestAuthOptions = {},
): Promise<TestAuth> => {
  const database = db ?? (await createTestDb());
  const sent: SentCode[] = [];
  const logs: string[] = [];
  let time = Date.now();
  const clock = { now: () => time, advance: (ms: number) => void (time += ms) };

  const email: EmailTransport = {
    sendCode: async (to, code) => {
      sent.push({ to, code });
      await afterSend?.(to, code);
    },
  };
  const repository = createAuthRepository(database);
  const auth = createAuthService({
    repository,
    email,
    logger: { warn: (line) => logs.push(line) },
    codeSecret: TEST_SECRETS.code,
    jwtSecret: TEST_SECRETS.jwt,
    now: clock.now,
  });
  return { db: database, repository, auth, sent, logs, clock };
};

/** The whole app over a test auth service, with an empty fake catalog. */
export const createTestApp = async ({
  corsOrigins = [],
  ...options
}: TestAuthOptions & { corsOrigins?: readonly string[] } = {}): Promise<
  TestAuth & { app: Hono }
> => {
  const testAuth = await createTestAuth(undefined, options);
  const logger = { warn: (line: string) => testAuth.logs.push(line) };
  const igdb = createFakeIgdb([], { genres: [], platforms: [] });
  const catalog = createCatalogService({
    repository: createCatalogRepository(testAuth.db),
    igdb: igdb.client,
    logger,
  });
  const app = createApp({
    catalog,
    auth: testAuth.auth,
    corsOrigins,
    logger,
    apiKey: TEST_API_KEY,
  });
  return { ...testAuth, app };
};

/**
 * Asks the app for a code and returns it once the transport has it: the send
 * happens after the answer, so it is waited for, never read at once.
 */
export const requestCode = async (t: TestAuth & { app: Hono }, email: string): Promise<string> => {
  const before = t.sent.filter((sent) => sent.to === email).length;
  await post(t.app, '/auth/code', { email });
  return vi.waitFor(() => {
    const codes = t.sent.filter((sent) => sent.to === email);
    const code = codes[before]?.code;
    if (code === undefined) throw new Error(`no new code for ${email}`);
    return code;
  });
};

/** Signs `email` in on a phone with `nodeId`, returning what `/auth/verify` answered. */
export const signIn = async (
  t: TestAuth & { app: Hono },
  email: string,
  nodeId: string,
): Promise<VerifyResponse> => {
  const code = await requestCode(t, email);
  const response = await post(t.app, '/auth/verify', { email, code, device: device(nodeId) });
  return verifyResponseSchema.parse(await response.json());
};

/** A device body for `/auth/verify`; each test passes its own node id. */
export const device = (nodeId: string) => ({ nodeId, platform: 'ios', appVersion: '1.0.0' });

/** A JSON POST against the app, as a client sends it. */
export const post = (app: Hono, path: string, body: unknown): Promise<Response> | Response =>
  app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
