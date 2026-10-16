import { refreshResponseSchema } from '@gameplan/contracts';
import type { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import { TEST_SECRETS, createTestApp, post, signIn } from '../testing/auth';
import type { TestAuth } from '../testing/auth';
import { hashRefreshToken, verifyAccessToken } from './tokens';

const SECOND = 1000;
const DAY = 24 * 60 * 60 * SECOND;

describe('POST /auth/refresh', () => {
  let t: TestAuth & { app: Hono };
  let node = 0;

  beforeAll(async () => {
    t = await createTestApp();
  });

  /** A signed-in phone's refresh token, each test on its own account. */
  const freshSession = async (): Promise<string> => {
    node += 1;
    const nodeId = `eeee${String(node).padStart(12, '0')}`;
    return (await signIn(t, `refresh-${node}@example.com`, nodeId)).refreshToken;
  };

  const refresh = (refreshToken: string) => post(t.app, '/auth/refresh', { refreshToken });

  /** The new refresh token, or the refusal's status. */
  const rotate = async (refreshToken: string): Promise<string | number> => {
    const response = await refresh(refreshToken);
    if (response.status !== 200) return response.status;
    return refreshResponseSchema.parse(await response.json()).refreshToken;
  };

  const rotated = async (refreshToken: string): Promise<string> => {
    const next = await rotate(refreshToken);
    if (typeof next !== 'string') throw new Error(`refresh refused with ${next}`);
    return next;
  };

  it('trades a refresh token for a new pair whose access token is valid', async () => {
    const response = await refresh(await freshSession());
    const pair = refreshResponseSchema.parse(await response.json());

    expect(
      await verifyAccessToken(pair.accessToken, TEST_SECRETS.jwt, t.clock.now()),
    ).not.toBeNull();
  });

  // Attack 6: a token used twice revokes its family; the token the first use
  // issued is refused too.
  it('revokes the whole family when a used token comes back after 30 seconds', async () => {
    const first = await freshSession();
    const second = await rotated(first);

    t.clock.advance(31 * SECOND);
    expect(await rotate(first)).toBe(401);
    expect(await rotate(second)).toBe(401);
  });

  // Attack 12: a lost response's retry inside 30 seconds keeps the session,
  // and the pair the lost response carried is revoked.
  it('lets a lost response be retried within 30 seconds', async () => {
    const first = await freshSession();
    const lost = await rotated(first);

    t.clock.advance(10 * SECOND);
    const retried = await rotated(first);
    expect(await rotate(lost)).toBe(401);
    expect(typeof (await rotate(retried))).toBe('string');
  });

  // Inside the window but with the child already used: the response clearly
  // arrived, so a replay is theft, not a retry.
  it('treats a replay as theft once the token it was rotated into has been used', async () => {
    const first = await freshSession();
    const second = await rotated(first);
    const third = await rotated(second);

    t.clock.advance(5 * SECOND);
    expect(await rotate(first)).toBe(401);
    expect(await rotate(third)).toBe(401);
  });

  it('refuses a token after its 60 days, and one that was never issued', async () => {
    const token = await freshSession();
    expect(await rotate('not-a-token-we-issued')).toBe(401);

    t.clock.advance(60 * DAY + SECOND);
    expect(await rotate(token)).toBe(401);
  });

  // The row lock: refreshes racing with one token must not each rotate into
  // an independent live token; exactly one is left. Eight, because two did not
  // reliably overlap: without the lock, the test passed anyway.
  it('leaves exactly one live token when refreshes race', async () => {
    const token = await freshSession();
    await Promise.all(Array.from({ length: 8 }, () => refresh(token)));

    const live = await t.db
      .selectFrom('refresh_tokens as presented')
      .innerJoin('refresh_tokens as family', 'family.family_id', 'presented.family_id')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('presented.token_hash', '=', hashRefreshToken(token))
      .where('family.used_at', 'is', null)
      .where('family.revoked_at', 'is', null)
      .executeTakeFirstOrThrow();
    expect(Number(live.count)).toBe(1);
  });
});
