import { z } from 'zod';

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';

/** Refresh once less than this share of the token's lifetime remains. */
const REFRESH_WHEN_REMAINING = 0.1;

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
});

export type TokenSource = {
  /** A valid app access token, fetched or refreshed as needed. */
  get: () => Promise<string>;
  /** Forget the current token, after IGDB rejects it with a 401. */
  invalidate: () => void;
};

export type TwitchTokenOptions = {
  clientId: string;
  clientSecret: string;
  now: () => number;
  fetch?: typeof globalThis.fetch;
};

/**
 * Twitch's client-credentials token for IGDB, kept in memory.
 *
 * Callers that arrive while a fetch is in flight share it, so a burst of
 * searches after start-up, or after expiry, asks Twitch once. The secret goes
 * in the POST body, never the URL, and a failure reports only the status:
 * Twitch's error body may echo what it was sent.
 */
export const createTwitchToken = ({
  clientId,
  clientSecret,
  now,
  fetch = globalThis.fetch,
}: TwitchTokenOptions): TokenSource => {
  let current: { value: string; expiresAt: number; lifetimeMs: number } | null = null;
  let pending: Promise<string> | null = null;

  const request = async (): Promise<string> => {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      }),
    });
    if (!response.ok)
      throw new Error(`Twitch token request failed with status ${response.status}.`);

    const parsed = tokenResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error('Twitch token response was not in the expected shape.');

    const lifetimeMs = parsed.data.expires_in * 1000;
    current = { value: parsed.data.access_token, expiresAt: now() + lifetimeMs, lifetimeMs };
    return current.value;
  };

  return {
    get: async () => {
      if (
        current !== null &&
        current.expiresAt - now() > current.lifetimeMs * REFRESH_WHEN_REMAINING
      ) {
        return current.value;
      }
      pending ??= request().finally(() => {
        pending = null;
      });
      return pending;
    },
    invalidate: () => {
      current = null;
    },
  };
};
