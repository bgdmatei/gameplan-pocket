import { sql } from 'kysely';
import type { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../testing/auth';
import type { TestAuth } from '../testing/auth';
import { createSyncTestKit } from '../testing/sync';
import type { SyncTestKit } from '../testing/sync';

describe('POST /sync/push', () => {
  let t: TestAuth & { app: Hono };
  let kit: SyncTestKit;

  beforeAll(async () => {
    t = await createTestApp();
    kit = createSyncTestKit(t);
  });

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
    const { token, userId } = await kit.account();
    const batch = [
      kit.setOp('list', 'l-1', { name: 'Co-op' }),
      kit.setOp('list', 'l-2', { name: 'RPG' }),
    ];

    const first = await kit.push(token, batch);
    const again = await kit.push(token, batch);

    expect(again).toEqual(first);
    expect(again.accepted).toEqual(batch.map((op) => op.id));
    expect(await loggedSeqs(userId)).toEqual([1, 2]);
  });

  it('numbers concurrent pushes from one account without gaps or repeats', async () => {
    const { token, userId } = await kit.account();
    const batches = Array.from({ length: 5 }, (_, b) =>
      Array.from({ length: 20 }, (_, i) => kit.setOp('list', `l-${b}-${i}`, { name: `L${i}` })),
    );

    await Promise.all(batches.map((batch) => kit.push(token, batch)));

    expect(await loggedSeqs(userId)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
  });

  // SPEC-sync-transport.md criterion 7: each bad op is refused, nothing from
  // it is logged or merged, and the valid ops beside it still land.
  it('refuses bad ops one by one, and lets another account touch only its own rows', async () => {
    const owner = await kit.account();
    const attacker = await kit.account();
    await kit.push(owner.token, [kit.setOp('list', 'shared-id', { name: 'Mine' })]);

    const valid = kit.setOp('list', 'own', { name: 'Fine' });
    const batch = [
      kit.setOp('list', 'shared-id', { name: 'Hijacked' }),
      kit.setOp('list', 'x', { userId: owner.userId }),
      kit.setOp('users', 'x', { name: 'x' }),
      { ...kit.setOp('list', 'x', { name: 'Later' }), hlc: kit.nextHlc(61_000) },
      valid,
    ];
    const result = await kit.push(attacker.token, batch);

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

  // A conflict holds note text, keyed by a derived id another account can
  // compute too: it must land in the pusher's rows only, and a refused one
  // must leave nothing behind, in the rows, the log or a log line.
  it("keeps conflicts in the pusher's own rows, and refused ones out of everything", async () => {
    const owner = await kit.account();
    const attacker = await kit.account();
    const secret = 'the code behind the waterfall is 4512';
    const conflict = (text: string) => ({
      noteItemId: 'n-1',
      text,
      fromNodeId: '3f9a2c1b7d4e8f60',
      hlc: kit.nextHlc(),
      createdAt: '2026-11-10T10:00:00.000Z',
      resolved: false,
    });
    await kit.push(owner.token, [kit.setOp('note_conflict', 'c-1', conflict(secret))]);
    t.logs.length = 0;

    const result = await kit.push(attacker.token, [
      kit.setOp('note_conflict', 'c-1', conflict('Hijacked')),
      kit.setOp('note_conflict', 'c-2', conflict(`${secret}\u0000`)),
    ]);

    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toEqual([expect.objectContaining({ index: 1, reason: 'invalid_op' })]);
    expect(await loggedSeqs(attacker.userId)).toEqual([1]);
    const rows = await t.db
      .selectFrom('note_conflicts')
      .select(['user_id', 'id', 'text'])
      .orderBy('text')
      .where('user_id', 'in', [owner.userId, attacker.userId])
      .execute();
    expect(rows).toEqual([
      { user_id: attacker.userId, id: 'c-1', text: 'Hijacked' },
      { user_id: owner.userId, id: 'c-1', text: secret },
    ]);
    expect(t.logs.join('\n')).not.toContain(secret);
  });

  it('refuses a request without a valid token', async () => {
    const response = await t.app.request('/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ops: [kit.setOp('list', 'l', { name: 'x' })] }),
    });
    expect(response.status).toBe(401);
  });

  it('never logs note text, accepted or refused', async () => {
    const { token } = await kit.account();
    const secret = 'the code behind the waterfall is 4512';
    const note = { entryId: 'e-1', type: 'secret', text: secret, resolved: false };
    t.logs.length = 0;

    await kit.push(token, [
      kit.setOp('note_item', 'n-1', { ...note, createdAt: '2026-11-10T10:00:00Z' }),
      kit.setOp('note_item', 'n-2', { ...note, createdAt: 'not a time' }),
    ]);

    expect(t.logs.length).toBeGreaterThan(0);
    expect(t.logs.join('\n')).not.toContain(secret);
  });

  // The columns the snapshot will read back (#16): jsonb, dates and a later
  // edit that loses to an earlier clock all have to survive the round trip.
  it('merges into typed columns, keeping the newest value per field', async () => {
    const { token, userId } = await kit.account();
    const create = kit.setOp('library_entry', 'e-1', {
      gameId: 1942,
      status: 'playing',
      progress: { type: 'chapter', value: 'Act II' },
      startedOn: '2026-11-01',
      createdAt: '2026-11-01T09:00:00Z',
    });
    const newer = kit.setOp('library_entry', 'e-1', { status: 'completed' });
    const older = { ...kit.setOp('library_entry', 'e-1', { status: 'dropped' }), hlc: create.hlc };

    await kit.push(token, [create, newer, older]);

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
