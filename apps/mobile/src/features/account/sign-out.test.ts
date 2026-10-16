import { webcrypto } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from '@gameplan/db-schema';
import { createEntry } from '@gameplan/domain';
import { getSyncState, updateSyncState } from '@gameplan/storage';
import { createNodeAdapter } from '@gameplan/storage/node';
import { commitLocalCreate, entryId } from '@gameplan/sync';
import type { SyncEnv } from '@gameplan/sync';
import { describe, expect, it, vi } from 'vitest';
import type { Session } from './session';
import { signOut } from './sign-out';

const env: SyncEnv = {
  now: () => Date.parse('2026-10-14T12:00:00.000Z'),
  randomBytes: (length) => webcrypto.getRandomValues(new Uint8Array(length)),
};

const signedIn: Session = {
  accessToken: 'access',
  refreshToken: 'refresh-to-revoke',
  accessExpiresAt: '2026-10-14T12:15:00.000Z',
  user: { id: '0b7a4c1e-7f4e-4c55-9d1a-2f0f3b6d8e10', email: 'player@example.com' },
  device: { id: '6f1c2b8a-3d4e-4f5a-8b9c-0d1e2f3a4b5c' },
};

describe('signOut', () => {
  // Criterion 5 and CLAUDE.md §Privacy: after signing out, nothing of the
  // player is left, on disk or in the secure store, for whoever uses the
  // phone next. Checked by reopening the database file, as an app restart would.
  it('leaves no library, owner, node id or session behind, and revokes the tokens', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'gameplan-signout-')), 'library.db');
    const adapter = createNodeAdapter({ path });
    await migrate(adapter);
    await commitLocalCreate(adapter, env, {
      entity: 'library_entry',
      next: createEntry(
        { id: entryId(1942), gameId: 1942, status: 'playing', createdAt: '2026-10-14T10:00:00Z' },
        { today: '2026-10-14' },
      ),
    });
    await updateSyncState(adapter, { ownerUserId: signedIn.user.id });

    let held: Session | null = signedIn;
    const loggedOut: string[] = [];
    await signOut({
      session: {
        current: async () => held,
        end: async () => {
          held = null;
        },
      },
      api: {
        logout: async (token) => {
          loggedOut.push(token);
          return { kind: 'offline' };
        },
      },
      erase: () => adapter.destroy(),
    });

    const reopened = createNodeAdapter({ path });
    await migrate(reopened);
    const [{ games } = { games: -1 }] = await reopened.execute<{ games: number }>(
      'SELECT count(*) AS games FROM library_entries',
    );
    const state = await getSyncState(reopened);

    expect(games).toBe(0);
    expect(state).toMatchObject({ ownerUserId: null, nodeId: null });
    expect(held).toBeNull();
    expect(loggedOut).toEqual(['refresh-to-revoke']);
  });

  // Found in review: the tokens went before the erase, so an erase that threw
  // left a retry with nothing to revoke, and the sign-in stayed live on the
  // server for 60 days. A failed erase must keep the tokens for the retry.
  it('keeps the tokens when the erase fails, so the retry still revokes them', async () => {
    let held: Session | null = signedIn;
    const loggedOut: string[] = [];
    let eraseFails = true;
    const deps = {
      session: {
        current: async () => held,
        end: async () => {
          held = null;
        },
      },
      api: {
        logout: async (token: string) => {
          loggedOut.push(token);
          return { kind: 'ok' as const, value: undefined };
        },
      },
      erase: async () => {
        if (eraseFails) throw new Error('database busy');
      },
    };

    await expect(signOut(deps)).rejects.toThrow('database busy');
    expect(held).toEqual(signedIn);
    expect(loggedOut).toEqual([]);

    eraseFails = false;
    await signOut(deps);
    expect(held).toBeNull();
    await vi.waitFor(() => expect(loggedOut).toEqual(['refresh-to-revoke']));
  });
});
