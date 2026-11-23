import { fetch as streamingFetch } from 'expo/fetch';
import { appVersion } from '@/data/env';
import { createSyncApi } from '@/data/sync-api';
import { createSyncEvents } from '@/data/sync-events';
import { authApi, session } from '@/features/account/auth-client';
import { endRefusedSession } from '@/features/account/session';

// Inlined at build time by Expo, as for auth (features/account/auth-client.ts).
const baseUrl = process.env.EXPO_PUBLIC_API_URL;

const notConfigured = (): Promise<Response> =>
  Promise.reject(new Error('EXPO_PUBLIC_API_URL is not set.'));

const auth = {
  accessToken: session.accessToken,
  rejected: session.rejected,
  end: () => endRefusedSession(session, (refreshToken) => authApi.logout(refreshToken)),
};

/** The app's sync client. Without an API URL every request fails as `offline`. */
export const syncApi = createSyncApi({
  baseUrl: baseUrl ?? '',
  appVersion,
  auth,
  ...(baseUrl === undefined ? { fetch: notConfigured } : {}),
});

/** The app's poke stream; without an API URL it ends as `offline`, like sync. */
export const syncEvents = createSyncEvents({
  baseUrl: baseUrl ?? '',
  appVersion,
  auth,
  fetch: baseUrl === undefined ? notConfigured : streamingFetch,
});
