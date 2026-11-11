import type { RefreshResponse } from '@gameplan/contracts';
import { describe, expect, it } from 'vitest';
import type { AuthResult } from './auth-api';
import { createSession, endRefusedSession } from '../features/account/session';
import type { Session } from '../features/account/session';
import { playerSession } from '../features/account/test-fixtures';
import { SyncRequestError, createSyncApi } from './sync-api';

const NOW = Date.parse('2026-10-14T12:00:00.000Z');
const EMPTY_PULL = { ops: [], lastSeq: 0, hasMore: false };

const fresh = (accessToken: string): Session =>
  playerSession({ accessToken, accessExpiresAt: new Date(NOW + 15 * 60_000).toISOString() });

/** A signed-in phone whose refresh hands out `access-2`, talking to `respond`. */
const phone = (
  respond: (request: Request) => Response | Promise<Response>,
  held: Session | null = fresh('access-1'),
) => {
  let stored = held;
  const seen: Request[] = [];
  const loggedOut: string[] = [];
  const session = createSession({
    store: {
      read: async () => stored,
      write: async (next) => {
        stored = next;
      },
      clear: async () => {
        stored = null;
      },
    },
    now: () => NOW,
    refresh: async (): Promise<AuthResult<RefreshResponse>> => ({
      kind: 'ok',
      value: { ...fresh('access-2') },
    }),
  });
  const api = createSyncApi({
    baseUrl: 'https://api.test',
    appVersion: '1.2.3',
    auth: {
      accessToken: session.accessToken,
      rejected: session.rejected,
      // As the app wires it (features/sync/sync-client.ts).
      end: () =>
        endRefusedSession(session, async (refreshToken) => {
          loggedOut.push(refreshToken);
          return { kind: 'ok', value: undefined };
        }),
    },
    fetch: async (input, init) => {
      const request = new Request(input, init);
      seen.push(request);
      return respond(request);
    },
  });
  return { api, seen, loggedOut, stored: () => stored };
};

const failureOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
    return 'no failure';
  } catch (error) {
    return error instanceof SyncRequestError ? error.kind : String(error);
  }
};

const tokensSent = (seen: readonly Request[]) =>
  seen.map((request) => request.headers.get('authorization'));

describe('sync API client', () => {
  it('refreshes once on a 401 and retries with the new token', async () => {
    const { api, seen } = phone((request) =>
      request.headers.get('authorization') === 'Bearer access-2'
        ? Response.json(EMPTY_PULL)
        : Response.json({ error: 'unauthorized' }, { status: 401 }),
    );

    expect(await api.pull({ after: 0, limit: 500 })).toEqual(EMPTY_PULL);
    expect(tokensSent(seen)).toEqual(['Bearer access-1', 'Bearer access-2']);
  });

  // A fresh token refused too means the account or device is gone: the
  // session ends, so no later sync sends a request until a new sign-in.
  it('ends the session when a fresh token is refused, and sends nothing after', async () => {
    const { api, seen, loggedOut, stored } = phone(() =>
      Response.json({ error: 'unauthorized' }, { status: 401 }),
    );

    expect(await failureOf(api.push([]))).toBe('ended');
    expect(stored()).toBeNull();
    expect(loggedOut).toEqual(['refresh']);

    expect(await failureOf(api.snapshot({ limit: 500 }))).toBe('signed_out');
    expect(seen).toHaveLength(2);
  });

  it.each([
    {
      case: 'no network',
      respond: () => Promise.reject(new TypeError('Network')),
      kind: 'offline',
    },
    { case: 'a 503', respond: () => new Response('', { status: 503 }), kind: 'offline' },
    {
      case: 'a 400',
      respond: () => Response.json({ error: 'invalid_request' }, { status: 400 }),
      kind: 'failed',
    },
    { case: 'a body off contract', respond: () => Response.json({ ops: 'x' }), kind: 'failed' },
    { case: 'a body not JSON', respond: () => new Response('<html>'), kind: 'failed' },
  ])('throws $kind for $case', async ({ respond, kind }) => {
    const { api } = phone(respond);
    expect(await failureOf(api.pull({ after: 0, limit: 500 }))).toBe(kind);
  });
});
