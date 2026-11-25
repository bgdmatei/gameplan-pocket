import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Note conflicts, materialised like every synced table: keyed by
 * user, every synced column nullable with no CHECK and no foreign key, since a
 * merged row can be partial and a merge must never be rejected (migration 003).
 * The key and bookkeeping columns repeat 003's, which can't be edited.
 */
export const migration006: Migration = {
  up: async (db: Kysely<unknown>) => {
    await db.schema
      .createTable('note_conflicts')
      .addColumn('user_id', 'uuid', (col) =>
        col.notNull().references('users.id').onDelete('cascade'),
      )
      .addColumn('id', 'text', (col) => col.notNull())
      .addColumn('field_hlc', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
      .addColumn('deleted', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('note_item_id', 'text')
      .addColumn('text', 'text')
      .addColumn('from_node_id', 'text')
      .addColumn('hlc', 'text')
      .addColumn('created_at', 'text')
      .addColumn('resolved', 'boolean')
      .addPrimaryKeyConstraint('note_conflicts_pk', ['user_id', 'id'])
      .execute();
  },
};
