import type { VerifyRequest } from '@gameplan/contracts';
import { getSyncState, updateSyncState } from '@gameplan/storage';
import type { StorageAdapter } from '@gameplan/storage';
import { ensureNodeId } from '@gameplan/sync';
import type { RandomBytes } from '@gameplan/sync';
import type { AuthApi } from '@/data/auth-api';
import type { Session, SessionManager } from './session';

/**
 * `library_belongs_to_other`: this phone holds another account's library, so
 * the player must erase it before signing in as someone else (decision 6).
 */
export type SignInResult =
  | { kind: 'signed_in'; session: Session }
  | { kind: 'invalid_code' }
  | { kind: 'library_belongs_to_other' }
  | { kind: 'offline' }
  | { kind: 'failed' };

export type SignInDeps = {
  adapter: StorageAdapter;
  api: Pick<AuthApi, 'verify' | 'logout'>;
  session: Pick<SessionManager, 'start'>;
  randomBytes: RandomBytes;
  platform: VerifyRequest['device']['platform'];
  appVersion: string;
};

/**
 * Signs in with a code and registers this phone under the node id its
 * edits are stamped with. Then the library's owner decides:
 * - none yet: the library becomes this account's (decision 3);
 * - this account: it stays, as after a session that ended with a 401;
 * - another account: refused, and the library is left exactly as it was.
 *
 * The last case is refused by the server before anything is written: the
 * phone names its library's owner, and another account gets
 * `library_owner_mismatch`, even when the owner's device is gone and the node
 * id is free (`device_conflict` covers it while that device exists). The local
 * check below is a second line, should the server ever answer otherwise.
 */
export const signIn = async (
  { adapter, api, session, randomBytes, platform, appVersion }: SignInDeps,
  { email, code }: { email: string; code: string },
): Promise<SignInResult> => {
  const nodeId = await adapter.transaction((tx) => ensureNodeId(tx, randomBytes));
  const { ownerUserId } = await getSyncState(adapter);

  const result = await api.verify({
    email,
    code,
    device: { nodeId, platform, appVersion },
    ...(ownerUserId === null ? {} : { ownerUserId }),
  });
  switch (result.kind) {
    case 'ok':
      break;
    case 'library_owner_mismatch':
      return { kind: 'library_belongs_to_other' };
    case 'device_conflict':
      // Node ids are random; with no owner a conflict is not a stale library.
      return ownerUserId === null ? { kind: 'failed' } : { kind: 'library_belongs_to_other' };
    case 'invalid_code':
    case 'offline':
    case 'failed':
      return { kind: result.kind };
    case 'unauthorized':
      return { kind: 'failed' };
  }

  const signedIn = result.value;
  if (ownerUserId !== null && ownerUserId !== signedIn.user.id) {
    // Tokens for an account that does not own this library: never kept.
    void api.logout(signedIn.refreshToken);
    return { kind: 'library_belongs_to_other' };
  }
  if (ownerUserId === null) {
    await updateSyncState(adapter, { ownerUserId: signedIn.user.id });
  }
  await session.start(signedIn);
  return { kind: 'signed_in', session: signedIn };
};
