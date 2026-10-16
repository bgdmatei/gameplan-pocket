import { createAuthApi } from '@/data/auth-api';
import { appVersion } from '@/data/env';
import { secureSessionStore } from './secure-session-store';
import { createSession } from './session';

// Inlined at build time by Expo, as for the catalog (data/catalog-api.ts).
const baseUrl = process.env.EXPO_PUBLIC_API_URL;

const notConfigured = (): Promise<Response> =>
  Promise.reject(new Error('EXPO_PUBLIC_API_URL is not set.'));

/** The app's auth client. Without an API URL every call reports `offline`. */
export const authApi = createAuthApi({
  baseUrl: baseUrl ?? '',
  appVersion,
  ...(baseUrl === undefined ? { fetch: notConfigured } : {}),
});

/** The phone's one session: the only way to an access token. */
export const session = createSession({
  store: secureSessionStore,
  refresh: (refreshToken) => authApi.refresh(refreshToken),
  now: () => Date.now(),
});
