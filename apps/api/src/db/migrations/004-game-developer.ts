import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The developer's name on games, and `catalog_fields`: which set of
 * IGDB fields a cached row was fetched with. Rows from before this migration
 * stay at 0, so the catalog re-fetches them the next time they're asked for
 * instead of serving them without a developer for good.
 */
export const migration004: Migration = {
  up: async (db: Kysely<unknown>) => {
    await db.schema
      .alterTable('games')
      .addColumn('developer', 'text')
      .addColumn('catalog_fields', 'integer', (col) => col.notNull().defaultTo(sql`0`))
      .execute();
  },
};
