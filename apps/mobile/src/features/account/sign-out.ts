import type { StorageAdapter } from '@gameplan/storage';
import type { AuthApi } from '@/data/auth-api';
import type { SessionManager } from './session';

export type SignOutDeps = {
  session: Pick<SessionManager, 'current' | 'end'>;
  api: Pick<AuthApi, 'logout'>;
  /** Destroys the database and opens an empty one (`useEraseDatabase`). */
  erase: () => Promise<void>;
};

export type LibraryCounts = { games: number; notes: number };

/** What an erase would lose: games and notes not already removed. */
export const libraryCounts = async (adapter: StorageAdapter): Promise<LibraryCounts> => {
  const [row] = await adapter.execute<LibraryCounts>(
    `SELECT (SELECT count(*) FROM library_entries WHERE deleted = 0) AS games,
            (SELECT count(*) FROM note_items WHERE deleted = 0) AS notes`,
  );
  return row ?? { games: 0, notes: 0 };
};

const plural = (count: number, one: string): string => `${count} ${one}${count === 1 ? '' : 's'}`;

/**
 * The one warning before anything erases the library (spec §Sign out,
 * decision 6): signing out, erasing without signing in, or erasing to sign
 * in as another account. Each dialog's title says why; this names what goes.
 */
export const eraseWarning = ({ games, notes }: LibraryCounts): string =>
  games === 0 && notes === 0
    ? 'There is nothing in your library yet.'
    : `This erases ${plural(games, 'game')} and ${plural(notes, 'note')} from this phone. ` +
      'Until sync arrives, they are not stored anywhere else.';

/**
 * Signing out leaves nothing of the player on the phone (CLAUDE.md §Privacy):
 * the whole database (library, notes, the library's owner and the node id),
 * then the tokens. The server is told once, best effort: offline, its tokens
 * simply expire. The tokens go only after the erase, so an erase that throws
 * leaves them for the retry to revoke. The screen warns first that, until
 * sync, the library is stored nowhere else.
 */
export const signOut = async ({ session, api, erase }: SignOutDeps): Promise<void> => {
  await erase();
  const current = await session.current();
  await session.end();
  if (current !== null) void api.logout(current.refreshToken);
};
