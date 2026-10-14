import { describe, expect, it } from 'vitest';
import { signAccessToken, verifyAccessToken } from './tokens';

const secret = 's'.repeat(32);
const claims = { userId: '0b7a4c1e-7f4e-4c55-9d1a-2f0f3b6d8e10', deviceId: 'd-1' };

const base64url = (value: object): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

describe('access tokens', () => {
  it('a token signed now verifies to the same user and device', async () => {
    const { token } = await signAccessToken(claims, { secret, nowMs: Date.now() });
    expect(await verifyAccessToken(token, secret, Date.now())).toEqual(claims);
  });

  // Attack 8 (unit half): each of these must be refused.
  it.each([
    [
      'tampered payload',
      async () => {
        const { token } = await signAccessToken(claims, { secret, nowMs: Date.now() });
        const [header, , signature] = token.split('.');
        const forged = base64url({ sub: 'someone-else', did: 'd-1', exp: 9_999_999_999 });
        return `${header}.${forged}.${signature}`;
      },
    ],
    [
      'signed with another secret',
      async () =>
        (await signAccessToken(claims, { secret: 'x'.repeat(32), nowMs: Date.now() })).token,
    ],
    [
      'expired',
      async () =>
        (await signAccessToken(claims, { secret, nowMs: Date.now() - 60 * 60 * 1000 })).token,
    ],
    [
      'alg: none',
      async () => {
        const nowS = Math.floor(Date.now() / 1000);
        const payload = { sub: claims.userId, did: 'd-1', iat: nowS, exp: nowS + 900 };
        return `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url(payload)}.`;
      },
    ],
    ['not a token', async () => 'garbage'],
  ])('refuses a token that is %s', async (_name, make) => {
    expect(await verifyAccessToken(await make(), secret, Date.now())).toBeNull();
  });
});
