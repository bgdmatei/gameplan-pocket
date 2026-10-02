import type { Migration } from 'kysely/migration';
import { migration001 } from './001-catalog';

/**
 * Every migration, keyed by a name that sorts in the order they run.
 * Append-only: a migration that has run anywhere is never edited.
 */
export const MIGRATIONS: Readonly<Record<string, Migration>> = {
  '001-catalog': migration001,
  // T16 proof: a failing migration must leave the previous deploy serving. Reverted next.
  '002-deliberate-failure': {
    up: async () => {
      throw new Error('Deliberate failure: T16 failed-migration proof');
    },
  },
};
