import { verifyResponseSchema } from '@gameplan/contracts';
import type { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, device, post, requestCode } from '../testing/auth';
import type { TestAuth } from '../testing/auth';

const MINUTE = 60 * 1000;

/** Any six digits other than `code`. */
const wrong = (code: string): string => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

describe('POST /auth/verify', () => {
  let t: TestAuth & { app: Hono };

  beforeAll(async () => {
    t = await createTestApp();
  });

  const verify = (email: string, code: string, nodeId: string) =>
    post(t.app, '/auth/verify', { email, code, device: device(nodeId) });

  it('signs a new email in, and the same email and phone again as the same user and device', async () => {
    const first = await verify(
      'new@example.com',
      await requestCode(t, 'new@example.com'),
      'aaaa000000000001',
    );
    expect(first.status).toBe(200);
    const signedIn = verifyResponseSchema.parse(await first.json());
    expect(signedIn.user.email).toBe('new@example.com');

    t.clock.advance(MINUTE + 1000);
    const code = await requestCode(t, 'new@example.com');
    const again = verifyResponseSchema.parse(
      await (await verify('new@example.com', code, 'aaaa000000000001')).json(),
    );
    expect(again.user.id).toBe(signedIn.user.id);
    expect(again.device.id).toBe(signedIn.device.id);
    // A used code does not work twice.
    expect((await verify('new@example.com', code, 'aaaa000000000001')).status).toBe(401);
  });

  // Attack 7: five wrong guesses burn the code; an expired code is refused.
  it('burns a code after five wrong guesses, and refuses an expired one', async () => {
    const burned = await requestCode(t, 'guess@example.com');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await verify('guess@example.com', wrong(burned), 'bbbb000000000001')).status).toBe(
        401,
      );
    }
    expect((await verify('guess@example.com', burned, 'bbbb000000000001')).status).toBe(401);

    const late = await requestCode(t, 'late@example.com');
    t.clock.advance(10 * MINUTE + 1000);
    const refused = await verify('late@example.com', late, 'bbbb000000000002');
    expect(refused.status).toBe(401);
    expect(await refused.json()).toEqual({ error: 'invalid_code' });
  });

  // Attack 13: twenty refused codes in 24 hours refuse even a fresh, right one.
  it('refuses every code for an email after twenty failures in a day', async () => {
    const address = 'capped@example.com';
    for (let round = 0; round < 4; round += 1) {
      t.clock.advance(MINUTE + 1000);
      const code = await requestCode(t, address);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await verify(address, wrong(code), 'cccc000000000001');
      }
    }
    t.clock.advance(MINUTE + 1000);
    const fresh = await requestCode(t, address);

    expect((await verify(address, fresh, 'cccc000000000001')).status).toBe(401);
  });

  // Attack 10: a node id another account registered is refused, and that
  // account's device is left as it was.
  it("refuses another account's node id and leaves its device alone", async () => {
    const nodeId = 'dddd000000000001';
    const owner = verifyResponseSchema.parse(
      await (
        await verify('owner@example.com', await requestCode(t, 'owner@example.com'), nodeId)
      ).json(),
    );

    const taken = await verify(
      'thief@example.com',
      await requestCode(t, 'thief@example.com'),
      nodeId,
    );
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({ error: 'device_conflict' });

    const row = await t.db
      .selectFrom('devices')
      .select(['id', 'user_id'])
      .where('node_id', '=', nodeId)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ id: owner.device.id, user_id: owner.user.id });
    // Nothing was created for the refused email either.
    expect(await t.repository.findUserByEmail('thief@example.com')).toBeUndefined();
  });
});
