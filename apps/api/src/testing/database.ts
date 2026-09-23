import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import pg from 'pg';
import { inject } from 'vitest';
import { createDb } from '../db/client';
import { migrateToLatest } from '../db/migrate';
import type { Database } from '../db/schema';

/**
 * A fresh, migrated database for one test file, inside the run's container.
 * Files run in parallel, so each gets its own database rather than sharing
 * tables. The container is discarded after the run, so nothing is dropped.
 */
export const createTestDb = async (): Promise<Kysely<Database>> => {
  const serverUrl = inject('databaseUrl');
  const name = `test_${randomUUID().replaceAll('-', '')}`;

  const admin = new pg.Client({ connectionString: serverUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();

  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  const db = createDb(url.toString());
  await migrateToLatest(db);
  return db;
};
