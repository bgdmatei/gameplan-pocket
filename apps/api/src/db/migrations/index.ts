import type { Migration } from 'kysely/migration';
import { migration001 } from './001-catalog';
import { migration002 } from './002-auth';

/**
 * Every migration, keyed by a name that sorts in the order they run.
 * Append-only: a migration that has run anywhere is never edited.
 */
export const MIGRATIONS: Readonly<Record<string, Migration>> = {
  '001-catalog': migration001,
  '002-auth': migration002,
};
