import * as SecureStore from 'expo-secure-store';
import { parseSession } from './session';
import type { SessionStore } from './session';

const KEY = 'gameplan.session';

/**
 * Readable after the phone's first unlock, so the session survives restarts
 * and a refresh can run in the background; never synced to iCloud or backups
 * (the `THIS_DEVICE_ONLY` variant), since a token is this phone's alone.
 */
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/** The session in the Keychain (iOS) or Keystore (Android). Kept apart so tests load no native code. */
export const secureSessionStore: SessionStore = {
  read: async () => {
    const stored = await SecureStore.getItemAsync(KEY, OPTIONS);
    if (stored === null) return null;
    try {
      return parseSession(JSON.parse(stored));
    } catch {
      return null;
    }
  },
  write: (session) => SecureStore.setItemAsync(KEY, JSON.stringify(session), OPTIONS),
  clear: () => SecureStore.deleteItemAsync(KEY, OPTIONS),
};
