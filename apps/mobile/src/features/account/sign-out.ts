import type { AuthApi } from '@/data/auth-api';
import type { SessionManager } from './session';

export type SignOutDeps = {
  session: Pick<SessionManager, 'current' | 'end'>;
  api: Pick<AuthApi, 'logout'>;
  /** Destroys the database and opens an empty one (`useEraseDatabase`). */
  erase: () => Promise<void>;
};

/**
 * Signing out leaves nothing of the player on the phone (CLAUDE.md §Privacy):
 * the tokens go, then the whole database (library, notes, the library's
 * owner and the node id). The server is told once, best effort: offline,
 * its tokens simply expire. The screen warns first that, until sync, the
 * library is stored nowhere else.
 */
export const signOut = async ({ session, api, erase }: SignOutDeps): Promise<void> => {
  const current = await session.current();
  await session.end();
  await erase();
  if (current !== null) void api.logout(current.refreshToken);
};
