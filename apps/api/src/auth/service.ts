import type { Logger } from '../logger';
import type { EmailTransport } from './email';
import type { AuthRepository } from './repository';
import { CODE_TTL_MS, hmacCode, newCode } from './tokens';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** Codes sent per email (SPEC-auth-identity.md §API). Over either, nothing is sent. */
const SEND_LIMITS = [
  { windowMs: MINUTE_MS, max: 1 },
  { windowMs: HOUR_MS, max: 5 },
] as const;

export type AuthServiceOptions = {
  repository: AuthRepository;
  email: EmailTransport;
  logger: Logger;
  codeSecret: string;
  now: () => number;
};

export type AuthService = ReturnType<typeof createAuthService>;

export const createAuthService = ({
  repository,
  email,
  logger,
  codeSecret,
  now,
}: AuthServiceOptions) => ({
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
});
