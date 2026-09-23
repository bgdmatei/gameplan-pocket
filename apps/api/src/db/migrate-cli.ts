import { loadDotEnv, readEnv } from '../env';
import { createDb } from './client';
import { migrateToLatest } from './migrate';

/**
 * `pnpm --filter api migrate`. Kept apart from server start-up so that, once
 * deployed, migrations can run under a credential the API itself does not
 * hold (SPEC-map.md §Security, least-privilege roles).
 */
loadDotEnv();
const db = createDb(readEnv(process.env).DATABASE_URL);
const applied = await migrateToLatest(db);
console.warn(applied.length === 0 ? 'Already up to date.' : `Applied: ${applied.join(', ')}`);
await db.destroy();
