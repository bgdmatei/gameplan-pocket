import type { Migration } from 'kysely/migration';
import { migration001 } from './001-catalog';
import { migration002 } from './002-auth';
import { migration003 } from './003-sync';
import { migration004 } from './004-game-developer';
import { migration005 } from './005-rating-scale';
import { migration006 } from './006-note-conflicts';
import { migration007 } from './007-op-base-hlc';

/**
 * Every migration, keyed by a name that sorts in the order they run.
 * Append-only: a migration that has run anywhere is never edited.
 */
export const MIGRATIONS: Readonly<Record<string, Migration>> = {
  '001-catalog': migration001,
  '002-auth': migration002,
  '003-sync': migration003,
  '004-game-developer': migration004,
  '005-rating-scale': migration005,
  '006-note-conflicts': migration006,
  '007-op-base-hlc': migration007,
};
