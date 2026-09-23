import type { Kysely } from 'kysely';
import { Migrator } from 'kysely/migration';
import { MIGRATIONS } from './migrations/index';
import type { Database } from './schema';

/** Runs pending migrations and returns the names of those it applied. */
export const migrateToLatest = async (db: Kysely<Database>): Promise<string[]> => {
  const migrator = new Migrator({ db, provider: { getMigrations: async () => MIGRATIONS } });
  const { error, results = [] } = await migrator.migrateToLatest();
  if (error !== undefined) throw error instanceof Error ? error : new Error(String(error));

  return results.filter((result) => result.status === 'Success').map((r) => r.migrationName);
};
