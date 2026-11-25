import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * A note text edit's base (ADR-009), logged so pulled ops arrive as the device
 * sent them. Edits logged before this lost their base: NULL, so they pull back
 * base-less and never count as concurrent.
 */
export const migration007: Migration = {
  up: async (db: Kysely<unknown>) => {
    await db.schema.alterTable('ops').addColumn('base_hlc', 'text').execute();
  },
};
