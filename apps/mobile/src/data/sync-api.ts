import {
  HEADERS,
  PROTOCOL_VERSION,
  pullResponseSchema,
  pushResponseSchema,
  snapshotResponseSchema,
} from '@gameplan/contracts';
import type { SyncApi } from '@gameplan/sync';

/**
 * Why a sync request did not happen or came back unusable.
 * - `signed_out`, `ended`: there is no sign-in to sync for; sync stops until
 *   the player signs in again.
 * - `offline`: no connection, a timeout or a 5xx; try again later.
 * - `failed`: any other unusable answer, such as one that fails the contract.
 */
export type SyncFailure = 'signed_out' | 'ended' | 'offline' | 'failed';

/** Thrown by the sync client: `syncOnce` takes a throwing transport (packages/sync). */
export class SyncRequestError extends Error {
  readonly kind: SyncFailure;

  constructor(kind: SyncFailure) {
    super(`Sync request ${kind}.`);
    this.name = 'SyncRequestError';
    this.kind = kind;
  }
}

/** A token from the session, or why there is none (the session's `AccessToken`). */
export type SyncToken =
  { kind: 'ok'; token: string } | { kind: 'signed_out' | 'ended' | 'offline' };

/** What the client needs from the sign-in; the app passes the session (features/sync). */
export type SyncAuth = {
  accessToken: () => Promise<SyncToken>;
  /** The server refused this token: refresh once. */
  rejected: (accessToken: string) => Promise<SyncToken>;
  /** A fresh token was refused too: the account or device is gone. */
  end: () => Promise<void>;
};

export type SyncApiConfig = {
  baseUrl: string;
  appVersion: string;
  auth: SyncAuth;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

/** A push of 500 ops or a page of 500 rows takes longer than an auth call. */
const TIMEOUT_MS = 30_000;

type Schema<T> = {
  safeParse: (value: unknown) => { success: true; data: T } | { success: false };
};

type Init = { method: 'GET' | 'POST'; body?: unknown };

const tokenOf = (token: SyncToken): string => {
  if (token.kind !== 'ok') throw new SyncRequestError(token.kind);
  return token.token;
};

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/**
 * The three sync routes, signed in with the session's token. A 401 refreshes
 * the session once and retries; a fresh token refused too ends the session,
 * as `checkSession` does. Bodies carry note text: none is ever logged here.
 */
export const createSyncApi = ({
  baseUrl,
  appVersion,
  auth,
  fetch = globalThis.fetch,
  timeoutMs = TIMEOUT_MS,
}: SyncApiConfig): SyncApi => {
  /** The answer's status and text; a connection that fails throws `offline`. */
  const send = async (path: string, init: Init, accessToken: string) => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        signal: abort.signal,
        method: init.method,
        headers: {
          [HEADERS.appVersion]: appVersion,
          [HEADERS.protocolVersion]: String(PROTOCOL_VERSION),
          Authorization: `Bearer ${accessToken}`,
          ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      return { status: response.status, text: await response.text() };
    } catch {
      throw new SyncRequestError('offline');
    } finally {
      clearTimeout(timer);
    }
  };

  const call = async <T>(path: string, init: Init, schema: Schema<T>): Promise<T> => {
    const first = tokenOf(await auth.accessToken());
    let answer = await send(path, init, first);
    if (answer.status === 401) {
      answer = await send(path, init, tokenOf(await auth.rejected(first)));
      if (answer.status === 401) {
        await auth.end();
        throw new SyncRequestError('ended');
      }
    }
    if (answer.status >= 500) throw new SyncRequestError('offline');
    if (answer.status !== 200) throw new SyncRequestError('failed');
    const body = schema.safeParse(parseJson(answer.text));
    if (!body.success) throw new SyncRequestError('failed');
    return body.data;
  };

  return {
    push: (ops) => call('/sync/push', { method: 'POST', body: { ops } }, pushResponseSchema),
    pull: ({ after, limit }) =>
      call(
        `/sync/pull?${new URLSearchParams({ after: String(after), limit: String(limit) }).toString()}`,
        { method: 'GET' },
        pullResponseSchema,
      ),
    snapshot: ({ cursor, limit }) =>
      call(
        `/sync/snapshot?${new URLSearchParams({
          limit: String(limit),
          ...(cursor !== undefined && { cursor }),
        }).toString()}`,
        { method: 'GET' },
        snapshotResponseSchema,
      ),
  };
};
