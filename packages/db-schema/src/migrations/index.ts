import { migration001 } from './001-initial';
import { migration002 } from './002-search-without-apostrophes';
import { migration003 } from './003-archived-entries';
import { migration004 } from './004-shelved-entries';
import { migration005 } from './005-library-owner';
import type { Migration } from './types';

/**
 * Every migration, in order. Append-only: a released migration is never
 * edited, because databases in the wild have already run it. Changing the
 * schema means adding the next file.
 */
export const MIGRATIONS: readonly Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.number ?? 0;
