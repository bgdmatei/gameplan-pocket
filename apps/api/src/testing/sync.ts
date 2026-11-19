import { randomUUID } from 'node:crypto';
import { pushResponseSchema } from '@gameplan/contracts';
import type { PushResponse } from '@gameplan/contracts';
import { formatHlc } from '@gameplan/sync';
import type { Hono } from 'hono';
import { expect } from 'vitest';
import { signIn } from './auth';
import type { TestAuth } from './auth';

const NODE = '3f9a2c1b7d4e8f60';

export type SyncTestKit = ReturnType<typeof createSyncTestKit>;

/** Accounts, ops and sync requests against one test app. */
export const createSyncTestKit = (t: TestAuth & { app: Hono }) => {
  let accounts = 0;
  let counter = 0;

  /**
   * `n` devices signed in to one new account, oldest first. Each device gets
   * its own node id (a reused one is `device_conflict`), and the clock moves
   * a minute between sign-ins (one code a minute per address).
   */
  const devices = async (n: number): Promise<{ userId: string; tokens: string[] }> => {
    accounts += 1;
    const email = `sync-${accounts}-${randomUUID()}@example.com`;
    const tokens: string[] = [];
    let userId = '';
    for (let device = 0; device < n; device += 1) {
      if (device > 0) t.clock.advance(61_000);
      const node = randomUUID().replaceAll('-', '').slice(0, 16);
      const session = await signIn(t, email, node);
      tokens.push(session.accessToken);
      userId = session.user.id;
    }
    return { userId, tokens };
  };

  const account = async (): Promise<{ token: string; userId: string }> => {
    const {
      userId,
      tokens: [token = ''],
    } = await devices(1);
    return { token, userId };
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
    schemaVersion: 2,
  });

  const deleteOp = (entity: string, entityId: string) => ({
    id: randomUUID(),
    entity,
    entityId,
    type: 'delete',
    hlc: nextHlc(),
    schemaVersion: 2,
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

  /** A signed-in GET, answered with its status and parsed JSON body. */
  const get = async (token: string, path: string) => {
    const response = await t.app.request(path, { headers: { Authorization: `Bearer ${token}` } });
    return { status: response.status, body: (await response.json()) as unknown };
  };

  return { account, devices, nextHlc, setOp, deleteOp, push, get };
};
