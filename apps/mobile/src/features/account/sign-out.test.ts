import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from '@gameplan/db-schema';
import { getSyncState, updateSyncState } from '@gameplan/storage';
import { createMigratedNodeAdapter, createNodeAdapter } from '@gameplan/storage/node';
import { describe, expect, it, vi } from 'vitest';
import type { Session } from './session';
import { eraseWarning, libraryCounts, signOut } from './sign-out';
import { playerSession, seedOneGame } from './test-fixtures';

const signedIn = playerSession({ refreshToken: 'refresh-to-revoke' });

describe('signOut', () => {
  // Criterion 5 and CLAUDE.md §Privacy: after signing out, nothing of the
  // player is left, on disk or in the secure store, for whoever uses the
  // phone next. Checked by reopening the database file, as an app restart would.
  it('leaves no library, owner, node id or session behind, and revokes the tokens', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'gameplan-signout-')), 'library.db');
    const adapter = createNodeAdapter({ path });
    await migrate(adapter);
    await seedOneGame(adapter);
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
    await vi.waitFor(() => expect(loggedOut).toEqual(['refresh-to-revoke']));
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

describe('the erase warning', () => {
  // The warning names what would be lost; a removed game is already gone.
  it('counts the live games and notes on the phone', async () => {
    const adapter = await createMigratedNodeAdapter();
    await seedOneGame(adapter);
    expect(await libraryCounts(adapter)).toEqual({ games: 1, notes: 0 });

    await adapter.execute('UPDATE library_entries SET deleted = 1');
    expect(await libraryCounts(adapter)).toEqual({ games: 0, notes: 0 });
  });

  it.each([
    { games: 1, notes: 0, says: 'This erases 1 game and 0 notes from this phone.' },
    { games: 12, notes: 3, says: 'This erases 12 games and 3 notes from this phone.' },
    { games: 0, notes: 0, says: 'There is nothing in your library yet.' },
  ])('$games games, $notes notes', ({ games, notes, says }) => {
    expect(eraseWarning({ games, notes })).toContain(says);
  });
});
