import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Accounts, sign-in codes, devices and refresh tokens (SPEC-auth-identity.md).
 *
 * Codes and refresh tokens are stored only as an HMAC or a hash, never as
 * sent. `auth_identities` is how a person signs in: `email` now, Apple and
 * Google later as more rows for the same user, without another migration.
 */
export const migration002: Migration = {
  up: async (db: Kysely<unknown>) => {
    await db.schema
      .createTable('users')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      // Lowercased and trimmed by the contract before it gets here.
      .addColumn('email', 'text', (col) => col.notNull().unique())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute();

    await db.schema
      .createTable('auth_identities')
      .addColumn('provider', 'text', (col) => col.notNull())
      .addColumn('subject', 'text', (col) => col.notNull())
      .addColumn('user_id', 'uuid', (col) =>
        col.notNull().references('users.id').onDelete('cascade'),
      )
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addPrimaryKeyConstraint('auth_identities_pk', ['provider', 'subject'])
      .execute();
    await db.schema
      .createIndex('auth_identities_user')
      .on('auth_identities')
      .column('user_id')
      .execute();

    await db.schema
      .createTable('auth_codes')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('email', 'text', (col) => col.notNull())
      // HMAC with CODE_SECRET: six digits are too few for a plain hash to hide.
      .addColumn('code_hmac', 'text', (col) => col.notNull())
      .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
      .addColumn('attempts', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('used_at', 'timestamptz')
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute();
    // The send limits count codes per email over the last minute and hour.
    await db.schema
      .createIndex('auth_codes_email_created')
      .on('auth_codes')
      .columns(['email', 'created_at'])
      .execute();

    // Wrong codes per email, counted over 24 hours for the daily cap.
    await db.schema
      .createTable('auth_failures')
      .addColumn('id', 'bigint', (col) => col.primaryKey().generatedAlwaysAsIdentity())
      .addColumn('email', 'text', (col) => col.notNull())
      .addColumn('failed_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute();
    await db.schema
      .createIndex('auth_failures_email_failed')
      .on('auth_failures')
      .columns(['email', 'failed_at'])
      .execute();

    // One row per node id, not per phone: a sign-out makes a new node id.
    await db.schema
      .createTable('devices')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('user_id', 'uuid', (col) =>
        col.notNull().references('users.id').onDelete('cascade'),
      )
      // Unique across accounts: one device's clock belongs to one account.
      .addColumn('node_id', 'text', (col) => col.notNull().unique())
      .addColumn('platform', 'text', (col) => col.notNull())
      .addColumn('app_version', 'text', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addColumn('last_seen_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute();
    await db.schema.createIndex('devices_user').on('devices').column('user_id').execute();

    await db.schema
      .createTable('refresh_tokens')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('user_id', 'uuid', (col) =>
        col.notNull().references('users.id').onDelete('cascade'),
      )
      .addColumn('device_id', 'uuid', (col) =>
        col.notNull().references('devices.id').onDelete('cascade'),
      )
      // Every token rotated from one sign-in; reuse revokes them all.
      .addColumn('family_id', 'uuid', (col) => col.notNull())
      // sha256 of the token, hex.
      .addColumn('token_hash', 'text', (col) => col.notNull().unique())
      .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
      .addColumn('used_at', 'timestamptz')
      // The token this one was rotated into, revoked if this one is replayed
      // inside the grace window (decision 5).
      .addColumn('replaced_by', 'uuid', (col) => col.references('refresh_tokens.id'))
      .addColumn('revoked_at', 'timestamptz')
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute();
    await db.schema
      .createIndex('refresh_tokens_family')
      .on('refresh_tokens')
      .column('family_id')
      .execute();
  },
};
