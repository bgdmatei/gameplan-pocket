import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { AUTH_LIMITS } from '@gameplan/contracts';
import { sign, verify } from 'hono/jwt';

/** Plan §7.2: short enough that a stolen access token is soon worthless. */
export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
export const REFRESH_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000;
export const CODE_TTL_MS = 10 * 60 * 1000;

const ISSUER = 'gameplan-api';
const ALG = 'HS256';

/** What an access token proves. `user_id` comes from here and nowhere else. */
export type AccessClaims = { userId: string; deviceId: string };

export const signAccessToken = async (
  claims: AccessClaims,
  { secret, nowMs }: { secret: string; nowMs: number },
): Promise<{ token: string; expiresAt: Date }> => {
  const iat = Math.floor(nowMs / 1000);
  const exp = Math.floor((nowMs + ACCESS_TOKEN_TTL_MS) / 1000);
  const token = await sign(
    { sub: claims.userId, did: claims.deviceId, iat, exp, iss: ISSUER },
    secret,
    ALG,
  );
  return { token, expiresAt: new Date(exp * 1000) };
};

/**
 * The claims of a valid token, or `null` for anything else: a bad signature,
 * another algorithm (`alg: none` included), another issuer, or an expired
 * token. Why it failed is not told; every failure is a `401`.
 *
 * Hono checks the signature, algorithm and issuer; expiry is checked here
 * against `nowMs`, the same clock that signed the token, so the service's
 * clock alone decides (Hono's own time checks read the wall clock).
 */
export const verifyAccessToken = async (
  token: string,
  secret: string,
  nowMs: number,
): Promise<AccessClaims | null> => {
  try {
    const payload = await verify(token, secret, {
      alg: ALG,
      iss: ISSUER,
      exp: false,
      iat: false,
      nbf: false,
    });
    const { sub, did, exp } = payload;
    if (typeof exp !== 'number' || exp * 1000 <= nowMs) return null;
    return typeof sub === 'string' && typeof did === 'string'
      ? { userId: sub, deviceId: did }
      : null;
  } catch {
    return null;
  }
};

/** 32 random bytes; only its hash is stored. */
export const newRefreshToken = (): string => randomBytes(32).toString('base64url');

export const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/** A uniformly random code, leading zeros kept. */
export const newCode = (): string =>
  String(randomInt(0, 10 ** AUTH_LIMITS.codeLength)).padStart(AUTH_LIMITS.codeLength, '0');

/**
 * Keyed with `CODE_SECRET`, because a million codes are too few for a plain
 * hash to hide. The email is part of the input, so a code can only ever
 * match the address it was sent to.
 */
export const hmacCode = (email: string, code: string, secret: string): string =>
  createHmac('sha256', secret)
    .update(JSON.stringify([email, code]))
    .digest('hex');

/** Constant-time equality for two hex digests. */
export const sameDigest = (a: string, b: string): boolean => {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
};
