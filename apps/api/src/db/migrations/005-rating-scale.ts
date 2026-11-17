import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

// Must ship with the pull downcast, or protocol-1 apps read 70 as 70. A large log would need batching.
export const migration005: Migration = {
  up: async (db: Kysely<unknown>) => {
    await sql`UPDATE library_entries SET rating = rating * 10 WHERE rating IS NOT NULL`.execute(db);
    await sql`
      UPDATE ops
         SET fields = jsonb_set(fields, '{rating}', to_jsonb((fields ->> 'rating')::integer * 10))
       WHERE entity = 'library_entry'
         AND type = 'set'
         AND jsonb_typeof(fields -> 'rating') = 'number'`.execute(db);
    await sql`UPDATE ops SET schema_version = 2 WHERE schema_version = 1`.execute(db);
  },
};
