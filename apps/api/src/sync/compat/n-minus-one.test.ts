import { randomBytes, randomUUID } from 'node:crypto';
import {
  HEADERS,
  pullResponseSchema,
  pushResponseSchema,
  snapshotResponseSchema,
} from '@gameplan/contracts';
import { createEntry, createNoteItem } from '@gameplan/domain';
import { createMigratedNodeAdapter } from '@gameplan/storage/node';
import { commitLocalCreate, commitLocalEdit, entryId, syncOnce } from '@gameplan/sync';
import type { SyncApi, SyncEnv } from '@gameplan/sync';
import type { Hono } from 'hono';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, signIn } from '../../testing/auth';
import type { TestAuth } from '../../testing/auth';
import { SERVED_PROTOCOLS } from '../../version-gate';
import * as pinned from './client-v2.bundle.js';

/*
 * The phone code installed today (pinned from 4463fdf, protocol 2) and
 * today's client, signed in to one account, syncing through the real API and
 * Postgres (ADR-017). The pinned build throws on a note conflict, so the
 * server must withhold every one from it (ADR-009).
 */

const GAME = 1942;
const NOTE = 'note-1';
const AT = '2026-11-24T09:00:00.000Z';

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

  const request = (token: string, path: string, protocol: number, body?: unknown) =>
    t.app.request(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        [HEADERS.appVersion]: '2.0.0',
        [HEADERS.protocolVersion]: String(protocol),
        Authorization: `Bearer ${token}`,
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const currentApi = (token: string): SyncApi => {
    const call = async <T>(
      path: string,
      schema: { parse: (value: unknown) => T },
      body?: unknown,
    ): Promise<T> => {
      const response = await request(token, path, SERVED_PROTOCOLS.max, body);
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

  it('keeps a protocol-2 phone syncing with an account that has note conflicts', async () => {
    const email = `n-1-${randomUUID()}@example.com`;
    const currentSession = await signIn(t, email, 'b2b2b2b2b2b2b2b2');
    const current = await createMigratedNodeAdapter();
    open.push(current);
    const env = envOf();
    const api = currentApi(currentSession.accessToken);
    const token = currentSession.accessToken;

    const entry = createEntry(
      { id: entryId(GAME), gameId: GAME, status: 'playing', createdAt: AT },
      { today: AT.slice(0, 10) },
    );
    const note = createNoteItem({
      id: NOTE,
      entryId: entry.id,
      createdAt: AT,
      type: 'puzzle',
      text: 'Lever',
    });
    await commitLocalCreate(current, env, { entity: 'library_entry', next: entry });
    const created = await commitLocalCreate(current, env, { entity: 'note_item', next: note });
    await syncOnce({ adapter: current, env, api });

    // The pinned build bootstraps before any conflict exists.
    t.clock.advance(61_000);
    const oldSession = await signIn(t, email, 'a1a1a1a1a1a1a1a1');
    const old = await pinned.createMigratedNodeAdapter();
    open.push(old);
    const oldEnv = envOf();
    const oldApi = pinnedDevice(oldSession.accessToken);
    await pinned.syncOnce({ adapter: old, env: oldEnv, api: oldApi });

    // Then a text edit carrying a base, and a conflict, reach the log.
    await commitLocalEdit(current, env, {
      entity: 'note_item',
      id: NOTE,
      update: (held) => ({
        next: { ...held, text: 'Lever, left one' },
        changed: { text: 'Lever, left one' },
        baseHlc: created.hlc,
      }),
    });
    await commitLocalCreate(current, env, {
      entity: 'note_conflict',
      next: {
        id: 'conflict-1',
        noteItemId: NOTE,
        text: 'Lever, right one',
        fromNodeId: 'a1a1a1a1a1a1a1a1',
        hlc: created.hlc,
        createdAt: AT,
        resolved: false,
      },
    });
    expect(await syncOnce({ adapter: current, env, api })).toMatchObject({
      pushed: 2,
      rejected: 0,
    });

    // The pinned build pulls them: the edit, never the conflict.
    expect(await pinned.syncOnce({ adapter: old, env: oldEnv, api: oldApi })).toMatchObject({
      pulled: 1,
      rejected: 0,
    });
    expect(await old.execute('SELECT text FROM note_items WHERE id = ?', [NOTE])).toEqual([
      { text: 'Lever, left one' },
    ]);

    // A protocol-2 answer holds no conflict and no reserved key it doesn't know.
    const oldPull = pullResponseSchema.parse(
      await (await request(token, '/sync/pull?after=0&limit=500', 2)).json(),
    );
    const oldSnapshot = snapshotResponseSchema.parse(
      await (await request(token, '/sync/snapshot?limit=500', 2)).json(),
    );
    const newSnapshot = snapshotResponseSchema.parse(
      await (await request(token, '/sync/snapshot?limit=500', 3)).json(),
    );
    expect(oldPull.ops.map(({ op }) => (op as { entity: string }).entity)).not.toContain(
      'note_conflict',
    );
    expect(oldSnapshot.rows.map(({ entity }) => entity)).not.toContain('note_conflict');
    expect(oldSnapshot.rows.flatMap(({ fieldHlc }) => Object.keys(fieldHlc))).not.toContain(
      '$base:text',
    );
    expect(newSnapshot.rows.map(({ entity }) => entity)).toContain('note_conflict');

    // And its own edits still reach the current phone.
    await pinned.commitLocalEdit(old, oldEnv, {
      entity: 'library_entry',
      id: pinned.entryId(GAME),
      update: (held) => ({ next: { ...held, rating: 80 }, changed: { rating: 80 } }),
    });
    expect(await pinned.syncOnce({ adapter: old, env: oldEnv, api: oldApi })).toMatchObject({
      pushed: 1,
      rejected: 0,
    });
    await syncOnce({ adapter: current, env, api });
    expect(
      await current.execute('SELECT rating FROM library_entries WHERE id = ?', [entryId(GAME)]),
    ).toEqual([{ rating: 80 }]);
  });

  it('tells a protocol-1 phone to update', async () => {
    const session = await signIn(t, `n-2-${randomUUID()}@example.com`, 'c3c3c3c3c3c3c3c3');
    const response = await request(session.accessToken, '/sync/pull?after=0', 1);
    expect(response.status).toBe(426);
  });
});
