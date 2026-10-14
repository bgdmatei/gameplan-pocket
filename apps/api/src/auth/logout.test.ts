import { refreshResponseSchema } from '@gameplan/contracts';
import type { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, post, signIn } from '../testing/auth';
import type { TestAuth } from '../testing/auth';

describe('POST /auth/logout', () => {
  let t: TestAuth & { app: Hono };

  beforeAll(async () => {
    t = await createTestApp();
  });

  // Signing out from a phone must end that sign-in everywhere it lives: an
  // older token of the same family (say, one a thief copied) stops working too.
  it('ends the whole sign-in, and repeating it or an unknown token is harmless', async () => {
    const { refreshToken: first } = await signIn(t, 'leaving@example.com', 'ffff000000000001');
    const rotated = await post(t.app, '/auth/refresh', { refreshToken: first });
    const { refreshToken: current } = refreshResponseSchema.parse(await rotated.json());

    expect((await post(t.app, '/auth/logout', { refreshToken: current })).status).toBe(204);
    expect((await post(t.app, '/auth/refresh', { refreshToken: current })).status).toBe(401);

    expect((await post(t.app, '/auth/logout', { refreshToken: current })).status).toBe(204);
    expect((await post(t.app, '/auth/logout', { refreshToken: 'never-issued' })).status).toBe(204);

    const live = await t.db
      .selectFrom('refresh_tokens')
      .select('id')
      .where('user_id', '=', (await t.repository.findUserByEmail('leaving@example.com'))?.id ?? '')
      .where('revoked_at', 'is', null)
      .execute();
    expect(live).toEqual([]);
  });
});
