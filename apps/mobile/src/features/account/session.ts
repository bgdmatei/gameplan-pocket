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

  const refreshShared = (session: Session): Promise<AccessToken> => {
    inFlight ??= refreshNow(session).finally(() => {
      inFlight = null;
    });
    return inFlight;
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
      return refreshShared(session);
    },

    /**
     * The server refused `accessToken` (a 401) before it expired, as when the
     * device was removed: refresh now, so a dead sign-in ends instead of
     * waiting out the token. Skipped if the token was already replaced.
     */
    rejected: async (accessToken: string): Promise<AccessToken> => {
      if (inFlight !== null) return inFlight;
      const session = await store.read();
      if (session === null) return { kind: 'signed_out' };
      if (session.accessToken !== accessToken) return { kind: 'ok', token: session.accessToken };
      return refreshShared(session);
    },
  };
};

export type SessionManager = ReturnType<typeof createSession>;

/**
 * Asks the server who we are with `me`. A 401 gets one refresh and one retry:
 * the refresh is what tells a revoked sign-in (`ended`) from a token the
 * server merely stopped accepting. Offline keeps the session.
 */
export const checkSession = async (
  session: SessionManager,
  me: (accessToken: string) => Promise<AuthResult<unknown>>,
): Promise<'online' | 'offline' | 'ended'> => {
  const ask = async (accessToken: string): Promise<'online' | 'offline' | 'refused'> => {
    const answer = await me(accessToken);
    if (answer.kind === 'unauthorized') return 'refused';
    return answer.kind === 'ok' ? 'online' : 'offline';
  };

  const first = await session.accessToken();
  if (first.kind !== 'ok') return first.kind === 'offline' ? 'offline' : 'ended';
  const answer = await ask(first.token);
  if (answer !== 'refused') return answer;

  const renewed = await session.rejected(first.token);
  if (renewed.kind !== 'ok') return renewed.kind === 'offline' ? 'offline' : 'ended';
  const retried = await ask(renewed.token);
  if (retried !== 'refused') return retried;
  // A fresh token refused too: the account or device is gone.
  await session.end();
  return 'ended';
};
