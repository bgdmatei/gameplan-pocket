import { randomUUID } from 'node:crypto';
import type { RefreshResponse, VerifyRequest, VerifyResponse } from '@gameplan/contracts';
import type { Logger } from '../logger';
import type { EmailTransport } from './email';
import type { AuthRepository, AuthStatements } from './repository';
import {
  CODE_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
  hashRefreshToken,
  hmacCode,
  newCode,
  newRefreshToken,
  sameDigest,
  signAccessToken,
} from './tokens';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Codes sent per email (SPEC-auth-identity.md §API). Over either, nothing is sent. */
const SEND_LIMITS = [
  { windowMs: MINUTE_MS, max: 1 },
  { windowMs: HOUR_MS, max: 5 },
] as const;

/** Wrong guesses one code survives; the next guess, right or wrong, is refused. */
const CODE_MAX_ATTEMPTS = 5;

/** Refused codes per email per 24 h before every code is refused (decision 7). */
const DAILY_FAILURE_CAP = 20;

/** How long a used refresh token may come back as a lost response's retry (decision 5). */
const REFRESH_GRACE_MS = 30 * 1000;

export type AuthServiceOptions = {
  repository: AuthRepository;
  email: EmailTransport;
  logger: Logger;
  codeSecret: string;
  jwtSecret: string;
  now: () => number;
};

/**
 * `invalid_code` covers every refused code alike (wrong, expired, burned, over
 * the daily cap), so a guesser learns nothing about which rule refused it.
 */
export type VerifyResult =
  { kind: 'ok'; value: VerifyResponse } | { kind: 'invalid_code' } | { kind: 'device_conflict' };

/** Every refused refresh is the same `unauthorized`: why is not told. */
export type RefreshResult = { kind: 'ok'; value: RefreshResponse } | { kind: 'unauthorized' };

export type AuthService = ReturnType<typeof createAuthService>;

export const createAuthService = ({
  repository,
  email,
  logger,
  codeSecret,
  jwtSecret,
  now,
}: AuthServiceOptions) => {
  /**
   * A refresh token in `familyId` (a new family at sign-in) and an access
   * token for this user and device. `refreshId` is the stored row's id.
   */
  const issueTokens = async (
    statements: AuthStatements,
    { userId, deviceId, familyId }: { userId: string; deviceId: string; familyId: string },
    at: number,
  ): Promise<{ refreshId: string; pair: RefreshResponse }> => {
    const refreshToken = newRefreshToken();
    const refreshId = await statements.insertRefreshToken({
      userId,
      deviceId,
      familyId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(at + REFRESH_TOKEN_TTL_MS),
    });
    const access = await signAccessToken({ userId, deviceId }, { secret: jwtSecret, nowMs: at });
    return {
      refreshId,
      pair: {
        accessToken: access.token,
        refreshToken,
        accessExpiresAt: access.expiresAt.toISOString(),
      },
    };
  };

  return {
    /**
     * Issues a code for `address` unless it is over a send limit. Never looks
     * up whether the address has an account, so a known and an unknown email
     * take the same path. The email goes out after this returns: the route
     * answers first, so the send's latency tells nothing either.
     */
    requestCode: async (address: string): Promise<void> => {
      const at = now();
      for (const { windowMs, max } of SEND_LIMITS) {
        const sent = await repository.countCodesSince(address, new Date(at - windowMs));
        if (sent >= max) return;
      }

      const code = newCode();
      await repository.insertCode({
        email: address,
        codeHmac: hmacCode(address, code, codeSecret),
        createdAt: new Date(at),
        expiresAt: new Date(at + CODE_TTL_MS),
      });

      // The error names a status at most (email.ts), never the address or code.
      void email.sendCode(address, code).catch((error: unknown) => {
        logger.warn(`Sign-in email failed: ${error instanceof Error ? error.message : 'unknown'}`);
      });
    },

    /**
     * Signs in with a code: creates the account on first use, registers the
     * device, and starts a refresh token family. One transaction, so the code
     * row stays locked while it is judged and nothing is half-written.
     */
    verify: async ({ email: address, code, device }: VerifyRequest): Promise<VerifyResult> => {
      const at = now();
      await repository.deleteFailuresBefore(new Date(at - DAY_MS));

      return repository.transaction(async (statements) => {
        const refuse = async (): Promise<VerifyResult> => {
          await statements.recordFailure(address, new Date(at));
          return { kind: 'invalid_code' };
        };

        // Over the cap, refused without another row: hammering a capped email
        // neither grows the table nor pushes the window further out.
        const failures = await statements.countFailuresSince(address, new Date(at - DAY_MS));
        if (failures >= DAILY_FAILURE_CAP) return { kind: 'invalid_code' };

        const stored = await statements.latestCodeForUpdate(address);
        if (
          stored === undefined ||
          stored.usedAt !== null ||
          stored.expiresAt.getTime() <= at ||
          stored.attempts >= CODE_MAX_ATTEMPTS
        ) {
          return refuse();
        }
        if (!sameDigest(hmacCode(address, code, codeSecret), stored.codeHmac)) {
          await statements.countCodeAttempt(stored.id);
          return refuse();
        }

        // A node id belongs to one account (ADR-006). Checked before anything is
        // written, so a conflict leaves the code, the user and the other device alone.
        const existingDevice = await statements.findDeviceByNodeId(device.nodeId);
        const existingUser = await statements.findUserByEmail(address);
        if (existingDevice !== undefined && existingDevice.userId !== existingUser?.id) {
          return { kind: 'device_conflict' };
        }

        await statements.markCodeUsed(stored.id, new Date(at));
        const user = existingUser ?? (await statements.findOrCreateUser(address));
        let deviceId: string;
        if (existingDevice === undefined) {
          deviceId = await statements.insertDevice({ userId: user.id, ...device });
        } else {
          deviceId = existingDevice.id;
          await statements.touchDevice(deviceId, device.appVersion, new Date(at));
        }

        const { pair } = await issueTokens(
          statements,
          { userId: user.id, deviceId, familyId: randomUUID() },
          at,
        );
        return {
          kind: 'ok',
          value: { ...pair, user: { id: user.id, email: user.email }, device: { id: deviceId } },
        };
      });
    },

    /**
     * Rotates a refresh token: the one presented is used up and a new pair
     * comes back in the same family. The presented row stays locked while it
     * is judged, so two refreshes with one token are decided in turn.
     *
     * A token already used is theft unless it is a lost response's retry: back
     * within 30 seconds, and the token it was rotated into still unused (the
     * phone never got it). Then the unused child is revoked and a new pair
     * issued. Otherwise the whole family is revoked, the thief's tokens and the
     * player's alike, and the player signs in again (decision 5).
     */
    refresh: async (refreshToken: string): Promise<RefreshResult> => {
      const at = now();
      return repository.transaction(async (statements) => {
        const token = await statements.refreshTokenForUpdate(hashRefreshToken(refreshToken));
        if (token === undefined || token.revokedAt !== null || token.expiresAt.getTime() <= at) {
          return { kind: 'unauthorized' };
        }

        if (token.usedAt !== null) {
          const child =
            token.replacedBy === null
              ? undefined
              : await statements.refreshTokenByIdForUpdate(token.replacedBy);
          const lostResponse =
            at - token.usedAt.getTime() <= REFRESH_GRACE_MS &&
            child !== undefined &&
            child.usedAt === null;
          if (!lostResponse) {
            await statements.revokeFamily(token.familyId, new Date(at));
            return { kind: 'unauthorized' };
          }
          await statements.revokeRefreshToken(child.id, new Date(at));
        }

        const { refreshId, pair } = await issueTokens(statements, token, at);
        await statements.markRefreshTokenUsed(token.id, refreshId, new Date(at));
        return { kind: 'ok', value: pair };
      });
    },
  };
};
