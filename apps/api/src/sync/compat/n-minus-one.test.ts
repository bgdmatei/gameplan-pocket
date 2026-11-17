import { randomBytes, randomUUID } from 'node:crypto';
import {
  HEADERS,
  pullResponseSchema,
  pushResponseSchema,
  snapshotResponseSchema,
} from '@gameplan/contracts';
import { upsertGames } from '@gameplan/storage';
import type { StorageAdapter } from '@gameplan/storage';
import { createMigratedNodeAdapter } from '@gameplan/storage/node';
import { commitLocalEdit, entryId, syncOnce } from '@gameplan/sync';
import type { SyncApi, SyncEnv } from '@gameplan/sync';
import type { Hono } from 'hono';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, signIn } from '../../testing/auth';
import type { TestAuth } from '../../testing/auth';
import { SERVED_PROTOCOLS } from '../../version-gate';
import * as pinned from './client-v1.bundle.js';
import type { PinnedAdapter } from './client-v1.bundle.js';

/*
 * The phone code installed today (pinned from 89012c4) and today's client,
 * signed in to one account, syncing through the real API and Postgres
 * (ADR-017). Each later schema-evolution change is checked against it.
 */

const GAME = 1942;

type Row = { rating: number | null; favourite: number; status: string };

const ENTRY_SQL = 'SELECT rating, favourite, status FROM library_entries WHERE id = ?';

describe('an N-1 phone and a current phone on one account', () => {
  let t: TestAuth & { app: Hono };

  const open: { close: () => Promise<void> }[] = [];

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterEach(async () => {
    await Promise.all(open.splice(0).map((adapter) => adapter.close()));
  });

  const envOf = (): SyncEnv => ({ now: t.clock.now, randomBytes: (n) => randomBytes(n) });

  const pinnedDevice = (token: string) =>
    pinned.createSyncApi({
      baseUrl: 'http://api.test',
      appVersion: '1.0.0',
      auth: {
        accessToken: async () => ({ kind: 'ok', token }),
        rejected: async () => ({ kind: 'signed_out' }),
        end: async () => undefined,
      },
      fetch: async (input, init) => t.app.request(input, init),
    });

  const currentApi = (token: string): SyncApi => {
    const call = async <T>(
      path: string,
      schema: { parse: (value: unknown) => T },
      body?: unknown,
    ): Promise<T> => {
      const response = await t.app.request(path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          [HEADERS.appVersion]: '2.0.0',
          [HEADERS.protocolVersion]: String(SERVED_PROTOCOLS.max),
          Authorization: `Bearer ${token}`,
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      expect(response.status).toBe(200);
      return schema.parse(await response.json());
    };
    return {
      push: (ops) => call('/sync/push', pushResponseSchema, { ops }),
      pull: ({ after, limit }) =>
        call(`/sync/pull?after=${String(after)}&limit=${String(limit)}`, pullResponseSchema),
      snapshot: ({ cursor, limit }) =>
        call(
          `/sync/snapshot?limit=${String(limit)}${cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`}`,
          snapshotResponseSchema,
        ),
    };
  };

  const entryOf = async (adapter: StorageAdapter | PinnedAdapter): Promise<Row | undefined> =>
    (await adapter.execute<Row>(ENTRY_SQL, [entryId(GAME)]))[0];

  it('keeps both in step, each on its own rating scale', async () => {
    const email = `n-1-${randomUUID()}@example.com`;
    const oldSession = await signIn(t, email, 'a1a1a1a1a1a1a1a1');
    // One code per email per minute.
    t.clock.advance(61_000);
    const newSession = await signIn(t, email, 'b2b2b2b2b2b2b2b2');

    const old = await pinned.createMigratedNodeAdapter();
    open.push(old);
    const oldEnv = envOf();
    const oldApi = pinnedDevice(oldSession.accessToken);
    await pinned.commitLocalCreate(old, oldEnv, {
      entity: 'library_entry',
      next: pinned.createEntry(
        {
          id: pinned.entryId(GAME),
          gameId: GAME,
          status: 'playing',
          createdAt: '2026-11-17T09:00:00Z',
        },
        { today: '2026-11-17' },
      ),
    });
    await pinned.commitLocalEdit(old, oldEnv, {
      entity: 'library_entry',
      id: pinned.entryId(GAME),
      update: (current) => ({ next: { ...current, rating: 7 }, changed: { rating: 7 } }),
    });
    expect(await pinned.syncOnce({ adapter: old, env: oldEnv, api: oldApi })).toMatchObject({
      pushed: 2,
      rejected: 0,
    });

    // The current phone bootstraps from the snapshot, with the game cached as
    // the app would after its catalog fetch.
    const current = await createMigratedNodeAdapter();
    open.push(current);
    const currentEnv = envOf();
    await upsertGames(current, {
      games: [
        {
          id: GAME,
          name: 'The Witcher 3: Wild Hunt',
          slug: 'the-witcher-3-wild-hunt',
          summary: null,
          firstReleaseDate: null,
          coverImageId: null,
          genreIds: [],
          platformIds: [],
          developer: null,
        },
      ],
      fetchedAt: '2026-11-17T09:00:00Z',
    });
    const api = currentApi(newSession.accessToken);
    await syncOnce({ adapter: current, env: currentEnv, api });
    expect(await entryOf(current)).toEqual({ rating: 70, favourite: 0, status: 'playing' });

    await commitLocalEdit(current, currentEnv, {
      entity: 'library_entry',
      id: entryId(GAME),
      update: (entry) => ({
        next: { ...entry, rating: 90, favourite: true },
        changed: { rating: 90, favourite: true },
      }),
    });
    expect(await syncOnce({ adapter: current, env: currentEnv, api })).toMatchObject({
      pushed: 1,
      rejected: 0,
    });

    expect(await pinned.syncOnce({ adapter: old, env: oldEnv, api: oldApi })).toMatchObject({
      pulled: 1,
      rejected: 0,
    });
    expect(await entryOf(old)).toEqual({ rating: 9, favourite: 1, status: 'playing' });
    expect(await entryOf(current)).toEqual({ rating: 90, favourite: 1, status: 'playing' });

    t.clock.advance(61_000);
    const lateSession = await signIn(t, email, 'c3c3c3c3c3c3c3c3');
    const late = await pinned.createMigratedNodeAdapter();
    open.push(late);
    const lateEnv = envOf();
    await pinned.syncOnce({
      adapter: late,
      env: lateEnv,
      api: pinnedDevice(lateSession.accessToken),
    });
    expect(await entryOf(late)).toEqual({ rating: 9, favourite: 1, status: 'playing' });
  });
});
