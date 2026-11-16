import { sql } from 'kysely';
import type { CreateTableBuilder, Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The op log and the materialised user tables (SPEC-sync-transport.md,
 * ADR-023). Grants come from the roles' default privileges (`db/roles.ts`).
 *
 * Every synced column is nullable, with no CHECK and no foreign key: a merged
 * row can be partial (an edit can arrive before its row's create) or hold a
 * value a local write would refuse, and a merge must never be rejected.
 * `field_hlc` says which fields have been set, so NULL here is either "set to
 * null" or "never set", told apart by whether the field has a clock.
 *
 * Ids from the catalog are bigint: the domain allows any safe integer, and a
 * valid op must never overflow its column. `db/client.ts` reads them as numbers.
 *
 * Times stay as the text the op carried (`createdAt`, `addedAt`): a
 * timestamptz would come back in another format, and the server's copy of a
 * row must equal the phones'.
 */

/** The key and merge bookkeeping every materialised table shares. */
const userRow = <T extends string>(table: CreateTableBuilder<T>) =>
  table
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('id', 'text', (col) => col.notNull())
    .addColumn('field_hlc', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('deleted', 'boolean', (col) => col.notNull().defaultTo(false));

export const migration003: Migration = {
  up: async (db: Kysely<unknown>) => {
    // Per-user log position. Push locks this row so seq stays gap-free under
    // concurrent pushes from one account's devices.
    await db.schema
      .createTable('user_sync')
      .addColumn('user_id', 'uuid', (col) =>
        col.primaryKey().references('users.id').onDelete('cascade'),
      )
      .addColumn('last_seq', 'bigint', (col) => col.notNull().defaultTo(0))
      .execute();

    await db.schema
      .createTable('ops')
      .addColumn('user_id', 'uuid', (col) =>
        col.notNull().references('users.id').onDelete('cascade'),
      )
      .addColumn('seq', 'bigint', (col) => col.notNull())
      .addColumn('op_id', 'uuid', (col) => col.notNull())
      .addColumn('entity', 'text', (col) => col.notNull())
      .addColumn('entity_id', 'text', (col) => col.notNull())
      .addColumn('type', 'text', (col) => col.notNull())
      // Null for a delete.
      .addColumn('fields', 'jsonb')
      .addColumn('hlc', 'text', (col) => col.notNull())
      .addColumn('schema_version', 'integer', (col) => col.notNull())
      .addColumn('received_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      // Pull pages by this key.
      .addPrimaryKeyConstraint('ops_pk', ['user_id', 'seq'])
      // A resent op is acknowledged, never logged twice.
      .addUniqueConstraint('ops_op_id', ['user_id', 'op_id'])
      .execute();

    await userRow(db.schema.createTable('library_entries'))
      .addColumn('game_id', 'bigint')
      .addColumn('status', 'text')
      .addColumn('rating', 'integer')
      // No foreign key to the catalog: a platform the catalog lacks (Steam
      // Deck) must still sync.
      .addColumn('platform_id', 'bigint')
      // A tagged union that travels as one field (domain progress.ts).
      .addColumn('progress', 'jsonb')
      .addColumn('playtime_minutes', 'integer')
      .addColumn('started_on', 'date')
      .addColumn('finished_on', 'date')
      .addColumn('favourite', 'boolean')
      .addColumn('shelved', 'boolean')
      .addColumn('archived', 'boolean')
      .addColumn('created_at', 'text')
      .addPrimaryKeyConstraint('library_entries_pk', ['user_id', 'id'])
      .execute();

    await userRow(db.schema.createTable('entry_tags'))
      .addColumn('entry_id', 'text')
      .addColumn('tag', 'text')
      .addPrimaryKeyConstraint('entry_tags_pk', ['user_id', 'id'])
      .execute();

    await userRow(db.schema.createTable('note_items'))
      .addColumn('entry_id', 'text')
      .addColumn('type', 'text')
      .addColumn('text', 'text')
      .addColumn('location', 'text')
      .addColumn('resolved', 'boolean')
      .addColumn('created_at', 'text')
      .addPrimaryKeyConstraint('note_items_pk', ['user_id', 'id'])
      .execute();

    await userRow(db.schema.createTable('lists'))
      .addColumn('name', 'text')
      .addColumn('description', 'text')
      .addColumn('created_at', 'text')
      .addPrimaryKeyConstraint('lists_pk', ['user_id', 'id'])
      .execute();

    await userRow(db.schema.createTable('list_items'))
      .addColumn('list_id', 'text')
      .addColumn('game_id', 'bigint')
      .addColumn('added_at', 'text')
      .addPrimaryKeyConstraint('list_items_pk', ['user_id', 'id'])
      .execute();
  },
};
