import { webcrypto } from 'node:crypto';
import { createEntry } from '@gameplan/domain';
import type { StorageAdapter } from '@gameplan/storage';
import { commitLocalCreate, entryId } from '@gameplan/sync';
import type { SyncEnv } from '@gameplan/sync';
import type { Session } from './session';

/** For the account tests only: one clock, one player, one game. */
export const testEnv: SyncEnv = {
  now: () => Date.parse('2026-10-14T12:00:00.000Z'),
  randomBytes: (length) => webcrypto.getRandomValues(new Uint8Array(length)),
};

export const PLAYER_ID = '0b7a4c1e-7f4e-4c55-9d1a-2f0f3b6d8e10';

/** A signed-in session; tests override the tokens and expiry they care about. */
export const playerSession = (overrides: Partial<Session> = {}): Session => ({
  accessToken: 'access',
  refreshToken: 'refresh',
  accessExpiresAt: '2026-10-14T12:15:00.000Z',
  user: { id: PLAYER_ID, email: 'player@example.com' },
  device: { id: '6f1c2b8a-3d4e-4f5a-8b9c-0d1e2f3a4b5c' },
  ...overrides,
});

/** A library with one game in it, to prove what is or isn't touched. */
export const seedOneGame = (adapter: StorageAdapter): Promise<unknown> =>
  commitLocalCreate(adapter, testEnv, {
    entity: 'library_entry',
    next: createEntry(
      { id: entryId(1942), gameId: 1942, status: 'playing', createdAt: '2026-10-14T10:00:00Z' },
      { today: '2026-10-14' },
    ),
  });
