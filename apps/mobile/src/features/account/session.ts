import { verifyResponseSchema } from '@gameplan/contracts';
import type { RefreshResponse, VerifyResponse } from '@gameplan/contracts';
import type { AuthResult } from '@/data/auth-api';

/**
 * What the phone keeps of a sign-in: exactly what `/auth/verify` answered,
 * with the tokens replaced on every refresh.
 */
export type Session = VerifyResponse;

/** Parses what the store held; anything else is treated as no session. */
export const parseSession = (value: unknown): Session | null => {
  const parsed = verifyResponseSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

/** Where the session lives: the secure store on the phone, memory in tests. */
export type SessionStore = {
  read: () => Promise<Session | null>;
  write: (session: Session) => Promise<void>;
  clear: () => Promise<void>;
};

/**
 * `offline`: a token could not be refreshed for now; the session is kept and
 * the caller tries again later. `ended`: the server refused the refresh token
 * (a 401), so the player must sign in again; the library stays on the phone.
 */
export type AccessToken =
  { kind: 'ok'; token: string } | { kind: 'signed_out' } | { kind: 'offline' } | { kind: 'ended' };

/** Refreshed this long before expiry, so a request never leaves with a dying token. */
const REFRESH_MARGIN_MS = 60 * 1000;

export type SessionOptions = {
  store: SessionStore;
  refresh: (refreshToken: string) => Promise<AuthResult<RefreshResponse>>;
  now: () => number;
};

/**
 * The phone's sign-in, and the only way to get an access token. A token is
 * refreshed when a request needs one, never on a timer, and one at a time:
 * callers that arrive while a refresh is in flight wait for it and share its
 * answer, because two refreshes with one token would read as theft on the
 * server. Never signed out for being offline (SPEC-auth-identity.md §Mobile).
 */
export const createSession = ({ store, refresh, now }: SessionOptions) => {
  let inFlight: Promise<AccessToken> | null = null;

  const refreshNow = async (session: Session): Promise<AccessToken> => {
    const result = await refresh(session.refreshToken);
    if (result.kind === 'ok') {
      await store.write({ ...session, ...result.value });
      return { kind: 'ok', token: result.value.accessToken };
    }
    if (result.kind === 'unauthorized') {
      // Only the tokens go. The library stays until the player erases it or
      // signs in again; the same account then keeps it (decision 6).
      await store.clear();
      return { kind: 'ended' };
    }
    return { kind: 'offline' };
  };

  return {
    current: (): Promise<Session | null> => store.read(),

    /** After `/auth/verify`. */
    start: (session: Session): Promise<void> => store.write(session),

    /** Forgets the tokens; signing out (sign-out.ts) also erases the library. */
    end: (): Promise<void> => store.clear(),

    accessToken: async (): Promise<AccessToken> => {
      if (inFlight !== null) return inFlight;
      const session = await store.read();
      if (session === null) return { kind: 'signed_out' };
      if (Date.parse(session.accessExpiresAt) - now() > REFRESH_MARGIN_MS) {
        return { kind: 'ok', token: session.accessToken };
      }
      inFlight ??= refreshNow(session).finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
};

export type SessionManager = ReturnType<typeof createSession>;
