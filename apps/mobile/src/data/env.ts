import type { SyncEnv } from '@gameplan/sync';
import Constants from 'expo-constants';
import { getRandomBytes } from 'expo-crypto';

/**
 * Time and randomness for `sync-core`, which reads neither itself. Hermes has
 * no `crypto.getRandomValues`, so ids and node ids draw on expo-crypto.
 */
export const syncEnv: SyncEnv = {
  now: () => Date.now(),
  randomBytes: (length) => getRandomBytes(length),
};

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * The player's calendar date, in their own time zone: a game finished at
 * 23:30 was finished today, whatever the UTC date says. Domain rules take it
 * as a parameter (derived start and finish dates).
 */
export const today = (): string => {
  const now = new Date();
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/** Sent with every API request, so the server can tell old clients apart later. */
export const appVersion: string = Constants.expoConfig?.version ?? '0.0.0';
