import type { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp } from '../../testing/auth';
import type { TestAuth } from '../../testing/auth';
import { createSyncTestKit } from '../../testing/sync';
import type { SyncTestKit } from '../../testing/sync';
import { createPokeHub } from './hub';
import type { PokeHub } from './hub';
import { createPokeListener } from './listener';
import type { PokeListener } from './listener';

describe('poke fan-out', () => {
  let t: TestAuth & { app: Hono; dbUrl: string };
  let kit: SyncTestKit;
  const instances: { hub: PokeHub; listener: PokeListener }[] = [];

  // One per API process; two of them stand in for two instances.
  const instance = async (): Promise<PokeHub> => {
    const hub = createPokeHub();
    const listener = createPokeListener({
      connectionString: t.dbUrl,
      hub,
      logger: { warn: (line) => t.logs.push(line) },
    });
    await listener.start();
    instances.push({ hub, listener });
    return hub;
  };

  const heard = (hub: PokeHub, userId: string): number[] => {
    const seqs: number[] = [];
    hub.register(userId, (seq) => seqs.push(seq));
    return seqs;
  };

  beforeAll(async () => {
    t = await createTestApp();
    kit = createSyncTestKit(t);
  });

  afterAll(async () => {
    await Promise.all(instances.map(({ listener }) => listener.stop()));
  });

  // Notifications reach a listener in commit order, so once the later push
  // is heard, anything the earlier one leaked would already be there.
  it("pokes the pushing account's streams with the new seq, and no one else's", async () => {
    const hub = await instance();
    const a = await kit.account();
    const b = await kit.account();
    const toA = heard(hub, a.userId);
    const toB = heard(hub, b.userId);

    await kit.push(a.token, [
      kit.setOp('list', 'a-1', { name: 'A' }),
      kit.setOp('list', 'a-2', { name: 'A' }),
    ]);
    await kit.push(b.token, [kit.setOp('list', 'b-1', { name: 'B' })]);

    await vi.waitFor(() => expect(toB).toEqual([1]));
    expect(toA).toEqual([2]);
  });

  it('pokes no one for a push that logged nothing', async () => {
    const hub = await instance();
    const a = await kit.account();
    const toA = heard(hub, a.userId);

    const batch = [kit.setOp('list', 'a-1', { name: 'A' })];
    await kit.push(a.token, batch);
    await kit.push(a.token, batch);
    const refused = await kit.push(a.token, [kit.setOp('users', 'x', { name: 'x' })]);
    expect(refused.accepted).toEqual([]);
    await kit.push(a.token, [kit.setOp('list', 'a-2', { name: 'A' })]);

    await vi.waitFor(() => expect(toA).toEqual([1, 2]));
  });

  it('reaches every API instance', async () => {
    const first = await instance();
    const second = await instance();
    const a = await kit.account();
    const onFirst = heard(first, a.userId);
    const onSecond = heard(second, a.userId);

    await kit.push(a.token, [kit.setOp('list', 'a-1', { name: 'A' })]);

    await vi.waitFor(() => {
      expect(onFirst).toEqual([1]);
      expect(onSecond).toEqual([1]);
    });
  });
});
