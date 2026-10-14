import { meResponseSchema } from '@gameplan/contracts';
import type { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, signIn } from '../testing/auth';
import type { TestAuth } from '../testing/auth';
import { signAccessToken } from './tokens';

const base64url = (value: object): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

describe('GET /me', () => {
  let t: TestAuth & { app: Hono };
  let node = 0;

  beforeAll(async () => {
    t = await createTestApp();
  });

  const session = async () => {
    node += 1;
    return signIn(t, `me-${node}@example.com`, `abcd${String(node).padStart(12, '0')}`);
  };

  const me = (headers: Record<string, string>, query = '') =>
    t.app.request(`/me${query}`, { headers });

  // user_id comes from the token alone: asking for someone else changes nothing.
  it("answers with the token's own user and device, whatever else the request says", async () => {
    const mine = await session();
    const theirs = await session();

    const response = await me(
      { Authorization: `Bearer ${mine.accessToken}`, 'X-User-Id': theirs.user.id },
      `?user_id=${theirs.user.id}`,
    );

    expect(response.status).toBe(200);
    expect(meResponseSchema.parse(await response.json())).toEqual({
      user: mine.user,
      device: mine.device,
    });
  });

  // Attack 8 (route half): every bad token is the same 401.
  it.each([
    ['missing', async () => ({})],
    [
      'not a bearer token',
      async () => ({ Authorization: `Basic ${(await session()).accessToken}` }),
    ],
    [
      'tampered',
      async () => {
        const [mine, theirs] = [await session(), await session()];
        const [header, , signature] = mine.accessToken.split('.');
        const payload = theirs.accessToken.split('.')[1];
        return { Authorization: `Bearer ${header}.${payload}.${signature}` };
      },
    ],
    [
      'alg: none',
      async () => {
        const { user, device } = await session();
        const exp = Math.floor(t.clock.now() / 1000) + 900;
        const forged = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ sub: user.id, did: device.id, iss: 'gameplan-api', exp })}.`;
        return { Authorization: `Bearer ${forged}` };
      },
    ],
    [
      'signed with another secret',
      async () => {
        const { user, device } = await session();
        const { token } = await signAccessToken(
          { userId: user.id, deviceId: device.id },
          { secret: 'x'.repeat(32), nowMs: t.clock.now() },
        );
        return { Authorization: `Bearer ${token}` };
      },
    ],
    [
      'expired',
      async () => {
        const { accessToken } = await session();
        t.clock.advance(15 * 60 * 1000 + 1000);
        return { Authorization: `Bearer ${accessToken}` };
      },
    ],
  ])('refuses a token that is %s', async (_case, headers) => {
    const response = await me(await headers());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });
});
