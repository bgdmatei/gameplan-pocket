import { loadDotEnv, readMigrationEnv } from '../env';
import { createDb } from './client';
import { migrateToLatest } from './migrate';

/**
 * `pnpm --filter api migrate`, as `gameplan_migrator`. Kept apart from server
 * start-up so migrations run under a credential the API itself does not use
 * (SPEC-map.md §Security, least-privilege roles).
 */
loadDotEnv();
const db = createDb(readMigrationEnv(process.env).MIGRATION_DATABASE_URL);
const applied = await migrateToLatest(db);
console.warn(applied.length === 0 ? 'Already up to date.' : `Applied: ${applied.join(', ')}`);
await db.destroy();
