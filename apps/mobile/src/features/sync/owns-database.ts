import { getSyncState } from '@gameplan/storage';
import type { StorageAdapter } from '@gameplan/storage';
import { session } from '@/features/account/auth-client';

/**
 * Whether this database syncs: a session exists and the database belongs to
 * its account. Tokens alone aren't enough: signing out erases the database
 * before it ends the session (sign-out.ts), and syncing the fresh one in
 * between would bring the library back (review of #21). The status UI uses
 * the same test, so it shows exactly when sync can run.
 */
export const ownsDatabase = async (adapter: StorageAdapter): Promise<boolean> => {
  const current = await session.current();
  if (current === null) return false;
  return (await getSyncState(adapter)).ownerUserId === current.user.id;
};
