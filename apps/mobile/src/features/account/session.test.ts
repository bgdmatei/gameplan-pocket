import type { RefreshResponse } from '@gameplan/contracts';
import { describe, expect, it } from 'vitest';
import type { AuthResult } from '@/data/auth-api';
import { createSession } from './session';
import type { Session, SessionStore } from './session';

const NOW = Date.parse('2026-10-14T12:00:00.000Z');

/** A session whose access token has already expired, so the next request refreshes. */
const expired: Session = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  accessExpiresAt: new Date(NOW - 1000).toISOString(),
  user: { id: '0b7a4c1e-7f4e-4c55-9d1a-2f0f3b6d8e10', email: 'player@example.com' },
  device: { id: '6f1c2b8a-3d4e-4f5a-8b9c-0d1e2f3a4b5c' },
};

const rotated: RefreshResponse = {
  accessToken: 'access-2',
  refreshToken: 'refresh-2',
  accessExpiresAt: new Date(NOW + 15 * 60 * 1000).toISOString(),
};

const memoryStore = (initial: Session | null): SessionStore & { held: () => Session | null } => {
  let held = initial;
  return {
    held: () => held,
    read: async () => held,
    write: async (session) => {
      held = session;
    },
    clear: async () => {
      held = null;
    },
  };
};

describe('session', () => {
  // Two refreshes with one token read as theft on the server and revoke the
  // whole sign-in, so callers arriving together must share one.
  it('gives concurrent callers one shared refresh', async () => {
    const store = memoryStore(expired);
    let calls = 0;
    let answer: (result: AuthResult<RefreshResponse>) => void = () => undefined;
    const session = createSession({
      store,
      now: () => NOW,
      refresh: () => {
        calls += 1;
        return new Promise((resolve) => {
          answer = resolve;
        });
      },
    });

    const waiting = Promise.all([
      session.accessToken(),
      session.accessToken(),
      session.accessToken(),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    answer({ kind: 'ok', value: rotated });

    expect(await waiting).toEqual(Array(3).fill({ kind: 'ok', token: 'access-2' }));
    expect(calls).toBe(1);
    expect(store.held()?.refreshToken).toBe('refresh-2');
  });

  // Never signed out for being offline; only the server refusing the
  // refresh token ends the session, and then only the tokens go.
  it.each([
    { refused: { kind: 'offline' }, expected: 'offline', kept: true },
    { refused: { kind: 'failed' }, expected: 'offline', kept: true },
    { refused: { kind: 'unauthorized' }, expected: 'ended', kept: false },
  ] as const)(
    'a refresh answered $refused.kind → $expected',
    async ({ refused, expected, kept }) => {
      const store = memoryStore(expired);
      const session = createSession({ store, now: () => NOW, refresh: async () => refused });

      expect(await session.accessToken()).toEqual({ kind: expected });
      expect(store.held()).toEqual(kept ? expired : null);
    },
  );
});
