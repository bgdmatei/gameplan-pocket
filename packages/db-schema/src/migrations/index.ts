import { migration001 } from './001-initial';
import { migration002 } from './002-search-without-apostrophes';
import { migration003 } from './003-archived-entries';
import { migration004 } from './004-shelved-entries';
import { migration005 } from './005-library-owner';
import { migration006 } from './006-theme';
import { migration007 } from './007-sync-transport';
import { migration008 } from './008-game-developer';
import { migration009 } from './009-rating-scale';
import { migration010 } from './010-note-conflict-node-id';
import { migration011 } from './011-protocol-3-resync';
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
  migration006,
  migration007,
  migration008,
  migration009,
  migration010,
  migration011,
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.number ?? 0;
