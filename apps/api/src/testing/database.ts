import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import { Migrator } from 'kysely/migration';
import pg from 'pg';
import { inject } from 'vitest';
import { createDb } from '../db/client';
import { migrateToLatest } from '../db/migrate';
import { MIGRATIONS } from '../db/migrations/index';
import { APP_ROLE, grantRoles, MIGRATOR_ROLE } from '../db/roles';
import type { Database } from '../db/schema';
import { TEST_ROLE_PASSWORDS } from './roles';

export type TestDatabase = {
  /** Connected as `gameplan_app`, the role the API runs as. */
  app: Kysely<Database>;
  /** Connected as `gameplan_migrator`, the role migrations run as. */
  migrator: Kysely<Database>;
};

const urlAs = (serverUrl: string, database: string, role: string, password: string): string => {
  const url = new URL(serverUrl);
  url.pathname = `/${database}`;
  url.username = role;
  url.password = password;
  return url.toString();
};

/**
 * A fresh, migrated database for one test file, inside the run's container,
 * set up the way staging is: granted, migrated as the migrator, used as the
 * app. Files run in parallel, so each gets its own database rather than
 * sharing tables. The container is discarded after the run, so nothing is
 * dropped.
 */
export const createTestDatabase = async ({
  ownerMigratedTo,
}: {
  /**
   * Run migrations up to this one as the superuser before the roles exist,
   * as staging did before them: those tables start owned by someone else.
   */
  ownerMigratedTo?: string;
} = {}): Promise<TestDatabase> => {
  const serverUrl = inject('databaseUrl');
  const name = `test_${randomUUID().replaceAll('-', '')}`;

  const admin = new pg.Client({ connectionString: serverUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();

  // Same superuser, inside the new database: grants are per database.
  const superUrl = new URL(serverUrl);
  superUrl.pathname = `/${name}`;
  const granter = new pg.Client({ connectionString: superUrl.toString() });
  await granter.connect();
  if (ownerMigratedTo !== undefined) {
    const owner = createDb(superUrl.toString());
    const { error } = await new Migrator({
      db: owner,
      provider: { getMigrations: async () => MIGRATIONS },
    }).migrateTo(ownerMigratedTo);
    await owner.destroy();
    if (error !== undefined) throw error instanceof Error ? error : new Error(String(error));
  }
  await grantRoles(granter, name);
  await granter.end();

  const migrator = createDb(urlAs(serverUrl, name, MIGRATOR_ROLE, TEST_ROLE_PASSWORDS.migrator));
  await migrateToLatest(migrator);
  const app = createDb(urlAs(serverUrl, name, APP_ROLE, TEST_ROLE_PASSWORDS.app));
  // Opens the pool now: Kysely makes it on the first query, so destroying an
  // unused one does nothing and a test that breaks the database by destroying
  // it would quietly reconnect (secrets.test.ts). Also proves the role logs in.
  await sql`SELECT 1`.execute(app);
  return { app, migrator };
};

/** The app's connection only, for tests that never need the migrator. */
export const createTestDb = async (): Promise<Kysely<Database>> => {
  const { app, migrator } = await createTestDatabase();
  await migrator.destroy();
  return app;
};
