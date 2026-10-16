import { describe, expect, it } from 'vitest';
import { createAuthApi } from './auth-api';

const api = (respond: () => Response | Promise<Response>) =>
  createAuthApi({ baseUrl: 'https://api.test', appVersion: '1.2.3', fetch: async () => respond() });

const PAIR = {
  accessToken: 'a',
  refreshToken: 'r',
  accessExpiresAt: '2026-10-14T12:15:00.000Z',
};

describe('auth API client', () => {
  // What each answer means to the phone: a wrong code is not an ended session,
  // and a server failure is not a reason to sign anyone out.
  it.each([
    { case: 'a new pair', respond: () => Response.json(PAIR), kind: 'ok' },
    {
      case: 'a refused code',
      respond: () => Response.json({ error: 'invalid_code' }, { status: 401 }),
      kind: 'invalid_code',
    },
    {
      case: 'a refused token',
      respond: () => Response.json({ error: 'unauthorized' }, { status: 401 }),
      kind: 'unauthorized',
    },
    {
      case: "another account's device",
      respond: () => Response.json({ error: 'device_conflict' }, { status: 409 }),
      kind: 'device_conflict',
    },
    {
      case: "another account's library",
      respond: () => Response.json({ error: 'library_owner_mismatch' }, { status: 409 }),
      kind: 'library_owner_mismatch',
    },
    {
      case: 'a server error',
      respond: () => new Response('boom', { status: 503 }),
      kind: 'offline',
    },
    {
      case: 'no connection',
      respond: () => Promise.reject(new TypeError('Network request failed')),
      kind: 'offline',
    },
    {
      case: 'a malformed answer',
      respond: () => Response.json({ accessToken: 1 }),
      kind: 'failed',
    },
  ])('$case → $kind', async ({ respond, kind }) => {
    expect((await api(respond).refresh('r')).kind).toBe(kind);
  });

  // Staging asleep on Render kept a sign-in spinning for 53 s (T24): with no
  // limit, a server that never answers spins forever. It reads as offline.
  it('gives up on a server that never answers, as offline', async () => {
    const silent = createAuthApi({
      baseUrl: 'https://api.test',
      appVersion: '1.2.3',
      timeoutMs: 20,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    });

    expect((await silent.requestCode('player@example.com')).kind).toBe('offline');
  });
});
