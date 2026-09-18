import { migration001 } from './001-initial';
import type { Migration } from './types';

/**
 * Every migration, in order. Append-only: a released migration is never
 * edited, because databases in the wild have already run it. Changing the
 * schema means adding the next file.
 */
export const MIGRATIONS: readonly Migration[] = [migration001];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.number ?? 0;
