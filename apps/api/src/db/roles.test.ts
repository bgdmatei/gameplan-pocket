import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestDatabase } from '../testing/database';

const { app, migrator } = await createTestDatabase();
afterAll(async () => {
  await Promise.all([app.destroy(), migrator.destroy()]);
});

describe('database roles', () => {
  // Attack (SPEC-sync-transport.md criterion 8). Proven by granting CREATE on
  // the schema to gameplan_app: this test then fails.
  it('refuses DDL from the role the API runs as', async () => {
    await expect(sql`CREATE TABLE backdoor (id int)`.execute(app)).rejects.toThrow(
      /permission denied/,
    );
    await expect(sql`DROP TABLE ops`.execute(app)).rejects.toThrow(/must be owner/);
  });

  // Default privileges, not per-table grants, reach the tables a migration
  // makes; a table the app can't read would only fail at the first sync.
  it.each([
    'users',
    'user_sync',
    'ops',
    'library_entries',
    'entry_tags',
    'note_items',
    'lists',
    'list_items',
  ])('lets the API read and write %s', async (table) => {
    await expect(
      // A comma list in has_table_privilege means "any of", so each is asked for.
      sql`SELECT bool_and(has_table_privilege(current_user, ${table}, p)) AS ok
          FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS p`
        .execute(app)
        .then(({ rows }) => rows[0]),
    ).resolves.toEqual({ ok: true });
  });

  // Staging ran 001 and 002 as Neon's owner before these roles existed. The
  // bootstrap must hand those tables to the migrator, or 003 can't run there
  // and the API loses its own users table.
  it('takes over a database migrated before the roles existed', async () => {
    const legacy = await createTestDatabase({ ownerMigratedTo: '002-auth' });

    const { rows } = await sql<{ owner: string }>`
      SELECT DISTINCT tableowner AS owner FROM pg_tables WHERE schemaname = 'public'`.execute(
      legacy.migrator,
    );
    expect(rows).toEqual([{ owner: 'gameplan_migrator' }]);
    await expect(sql`SELECT count(*) FROM users`.execute(legacy.app)).resolves.toBeDefined();
    await expect(sql`SELECT count(*) FROM ops`.execute(legacy.app)).resolves.toBeDefined();
    await Promise.all([legacy.app.destroy(), legacy.migrator.destroy()]);
  });
});
