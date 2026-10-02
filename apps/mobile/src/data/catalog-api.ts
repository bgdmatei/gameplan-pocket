import { createCatalogApi } from './api';
import { appVersion } from './env';

// Inlined at build time by Expo. Neither is a secret: the key only keeps
// casual scrapers off the catalog (see apps/api's AppDependencies.apiKey).
const baseUrl = process.env.EXPO_PUBLIC_API_URL;
const apiKey = process.env.EXPO_PUBLIC_API_KEY;

const notConfigured = (): Promise<Response> =>
  Promise.reject(new Error('EXPO_PUBLIC_API_URL or EXPO_PUBLIC_API_KEY is not set.'));

if (baseUrl === undefined || apiKey === undefined) {
  console.warn(
    'EXPO_PUBLIC_API_URL or EXPO_PUBLIC_API_KEY is not set (see apps/mobile/.env.example): ' +
      'search will use this phone’s cache only.',
  );
}

/**
 * The app's catalog client. Without configuration every call reports
 * `offline`, so the app still works from what this phone has cached.
 */
export const catalogApi = createCatalogApi({
  baseUrl: baseUrl ?? '',
  apiKey: apiKey ?? '',
  appVersion,
  ...(baseUrl === undefined || apiKey === undefined ? { fetch: notConfigured } : {}),
});
