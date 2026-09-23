import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The catalog cache: games, their genres and platforms, and recent searches.
 *
 * Genre and platform ids are arrays on `games` rather than join tables: the
 * server only ever reads them whole, and clients keep their own join tables.
 * The trigram index makes fuzzy name search (`pg_trgm`) fast.
 */
export const migration001: Migration = {
  up: async (db: Kysely<unknown>) => {
    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`.execute(db);
    await sql`CREATE SEQUENCE catalog_version_seq`.execute(db);

    await db.schema
      .createTable('games')
      .addColumn('id', 'integer', (col) => col.primaryKey())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('slug', 'text', (col) => col.notNull())
      .addColumn('summary', 'text')
      .addColumn('first_release_date', 'date')
      .addColumn('cover_image_id', 'text')
      .addColumn('genre_ids', sql`integer[]`, (col) => col.notNull().defaultTo(sql`'{}'`))
      .addColumn('platform_ids', sql`integer[]`, (col) => col.notNull().defaultTo(sql`'{}'`))
      .addColumn('fetched_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addColumn('catalog_version', 'bigint', (col) =>
        col.notNull().defaultTo(sql`nextval('catalog_version_seq')`),
      )
      .execute();
    await sql`CREATE INDEX games_name_trgm ON games USING gin (name gin_trgm_ops)`.execute(db);

    await db.schema
      .createTable('genres')
      .addColumn('id', 'integer', (col) => col.primaryKey())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('slug', 'text', (col) => col.notNull())
      .addColumn('fetched_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute();

    await db.schema
      .createTable('platforms')
      .addColumn('id', 'integer', (col) => col.primaryKey())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('abbreviation', 'text')
      .addColumn('fetched_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute();

    await db.schema
      .createTable('search_cache')
      .addColumn('query', 'text', (col) => col.primaryKey())
      .addColumn('game_ids', sql`integer[]`, (col) => col.notNull())
      .addColumn('fetched_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute();
  },
};
