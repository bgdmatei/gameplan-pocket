import { randomUUID } from 'node:crypto';
import { pushResponseSchema } from '@gameplan/contracts';
import type { PushResponse } from '@gameplan/contracts';
import { formatHlc } from '@gameplan/sync';
import type { Hono } from 'hono';
import { sql } from 'kysely';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, signIn } from '../testing/auth';
import type { TestAuth } from '../testing/auth';

const NODE = '3f9a2c1b7d4e8f60';

describe('POST /sync/push', () => {
  let t: TestAuth & { app: Hono };
  let accounts = 0;
  let counter = 0;

  beforeAll(async () => {
    t = await createTestApp();
  });

  const account = async (): Promise<{ token: string; userId: string }> => {
    accounts += 1;
    const node = `beef${String(accounts).padStart(12, '0')}`;
    const session = await signIn(t, `sync-${accounts}@example.com`, node);
    return { token: session.accessToken, userId: session.user.id };
  };

  /** A clock just after the last one, near the service's own time. */
  const nextHlc = (aheadMs = 0) => {
    counter += 1;
    return formatHlc({ wallMs: t.clock.now() + aheadMs, counter, nodeId: NODE });
  };

  const setOp = (entity: string, entityId: string, fields: Record<string, unknown>) => ({
    id: randomUUID(),
    entity,
    entityId,
    type: 'set',
    fields,
    hlc: nextHlc(),
    schemaVersion: 1,
  });

  const push = async (token: string, ops: unknown[]): Promise<PushResponse> => {
    const response = await t.app.request('/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ops }),
    });
    expect(response.status).toBe(200);
    return pushResponseSchema.parse(await response.json());
  };

  const loggedSeqs = async (userId: string): Promise<number[]> =>
    (
      await t.db
        .selectFrom('ops')
        .select('seq')
        .where('user_id', '=', userId)
        .orderBy('seq')
        .execute()
    ).map(({ seq }) => seq);

  it('acknowledges a resent batch but logs each op once', async () => {
    const { token, userId } = await account();
    const batch = [setOp('list', 'l-1', { name: 'Co-op' }), setOp('list', 'l-2', { name: 'RPG' })];

    const first = await push(token, batch);
    const again = await push(token, batch);

    expect(again).toEqual(first);
    expect(again.accepted).toEqual(batch.map((op) => op.id));
    expect(await loggedSeqs(userId)).toEqual([1, 2]);
  });

  it('numbers concurrent pushes from one account without gaps or repeats', async () => {
    const { token, userId } = await account();
    const batches = Array.from({ length: 5 }, (_, b) =>
      Array.from({ length: 20 }, (_, i) => setOp('list', `l-${b}-${i}`, { name: `L${i}` })),
    );

    await Promise.all(batches.map((batch) => push(token, batch)));

    expect(await loggedSeqs(userId)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
  });

  // SPEC-sync-transport.md criterion 7: each bad op is refused, nothing from
  // it is logged or merged, and the valid ops beside it still land.
  it('refuses bad ops one by one, and lets another account touch only its own rows', async () => {
    const owner = await account();
    const attacker = await account();
    await push(owner.token, [setOp('list', 'shared-id', { name: 'Mine' })]);

    const valid = setOp('list', 'own', { name: 'Fine' });
    const batch = [
      setOp('list', 'shared-id', { name: 'Hijacked' }),
      setOp('list', 'x', { userId: owner.userId }),
      setOp('users', 'x', { name: 'x' }),
      { ...setOp('list', 'x', { name: 'Later' }), hlc: nextHlc(61_000) },
      valid,
    ];
    const result = await push(attacker.token, batch);

    expect(result.rejected).toEqual([
      { index: 1, opId: batch[1]?.id, reason: 'invalid_op' },
      { index: 2, opId: batch[2]?.id, reason: 'invalid_op' },
      { index: 3, opId: batch[3]?.id, reason: 'clock_ahead' },
    ]);
    expect(result.accepted).toEqual([batch[0]?.id, valid.id]);
    expect(await loggedSeqs(attacker.userId)).toEqual([1, 2]);

    const names = await t.db
      .selectFrom('lists')
      .select(['user_id', 'name'])
      .where('id', '=', 'shared-id')
      .orderBy('name')
      .execute();
    // The attacker's op made its own row; the owner's is untouched.
    expect(names).toEqual([
      { user_id: attacker.userId, name: 'Hijacked' },
      { user_id: owner.userId, name: 'Mine' },
    ]);
  });

  it('refuses a request without a valid token', async () => {
    const response = await t.app.request('/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ops: [setOp('list', 'l', { name: 'x' })] }),
    });
    expect(response.status).toBe(401);
  });

  it('never logs note text, accepted or refused', async () => {
    const { token } = await account();
    const secret = 'the code behind the waterfall is 4512';
    const note = { entryId: 'e-1', type: 'secret', text: secret, resolved: false };
    t.logs.length = 0;

    await push(token, [
      setOp('note_item', 'n-1', { ...note, createdAt: '2026-11-10T10:00:00Z' }),
      setOp('note_item', 'n-2', { ...note, createdAt: 'not a time' }),
    ]);

    expect(t.logs.length).toBeGreaterThan(0);
    expect(t.logs.join('\n')).not.toContain(secret);
  });

  // The columns the snapshot will read back (#16): jsonb, dates and a later
  // edit that loses to an earlier clock all have to survive the round trip.
  it('merges into typed columns, keeping the newest value per field', async () => {
    const { token, userId } = await account();
    const create = setOp('library_entry', 'e-1', {
      gameId: 1942,
      status: 'playing',
      progress: { type: 'chapter', value: 'Act II' },
      startedOn: '2026-11-01',
      createdAt: '2026-11-01T09:00:00Z',
    });
    const newer = setOp('library_entry', 'e-1', { status: 'completed' });
    const older = { ...setOp('library_entry', 'e-1', { status: 'dropped' }), hlc: create.hlc };

    await push(token, [create, newer, older]);

    const row = await t.db
      .selectFrom('library_entries')
      .select(['game_id', 'status', 'progress', 'started_on', 'created_at', 'rating', 'deleted'])
      .select(sql<string[]>`ARRAY(SELECT jsonb_object_keys(field_hlc) ORDER BY 1)`.as('clocked'))
      .where('user_id', '=', userId)
      .where('id', '=', 'e-1')
      .executeTakeFirstOrThrow();
    expect(row).toEqual({
      game_id: 1942,
      status: 'completed',
      progress: { type: 'chapter', value: 'Act II' },
      started_on: '2026-11-01',
      created_at: '2026-11-01T09:00:00Z',
      // Never set: NULL, and no clock says otherwise.
      rating: null,
      deleted: false,
      clocked: ['createdAt', 'gameId', 'progress', 'startedOn', 'status'],
    });
  });
});
