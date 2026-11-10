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

  const account = async (): Promise<{ token: string; userId: string }> => {
    accounts += 1;
    const node = `beef${String(accounts).padStart(12, '0')}`;
    const session = await signIn(t, `sync-${accounts}-${randomUUID()}@example.com`, node);
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

  const deleteOp = (entity: string, entityId: string) => ({
    id: randomUUID(),
    entity,
    entityId,
    type: 'delete',
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

  /** A signed-in GET, answered with its status and parsed JSON body. */
  const get = async (token: string, path: string) => {
    const response = await t.app.request(path, { headers: { Authorization: `Bearer ${token}` } });
    return { status: response.status, body: (await response.json()) as unknown };
  };

  return { account, nextHlc, setOp, deleteOp, push, get };
};
