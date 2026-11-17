import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { createTestDatabase } from '../../testing/database';
import { migrateToLatest } from '../migrate';

describe('migration 005, the rating on 0-100', () => {
  it('multiplies stored and logged ratings, and leaves only schema v2 in the log', async () => {
    const { app, migrator: db } = await createTestDatabase({ migratedTo: '004-game-developer' });
    await app.destroy();
    const user = randomUUID();
    await sql`INSERT INTO users (id, email) VALUES (${user}, ${`${user}@example.com`})`.execute(db);
    await sql`
      INSERT INTO library_entries (user_id, id, rating) VALUES
        (${user}, 'rated', 7), (${user}, 'unrated', NULL)`.execute(db);
    const op = (seq: number, entity: string, fields: object) =>
      sql`(${user}, ${seq}, ${randomUUID()}, ${entity}, 'x', 'set', ${JSON.stringify(fields)}::jsonb, 'h', 1)`;
    await sql`
      INSERT INTO ops (user_id, seq, op_id, entity, entity_id, type, fields, hlc, schema_version)
      VALUES ${sql.join([
        op(1, 'library_entry', { rating: 7, status: 'playing' }),
        op(2, 'library_entry', { rating: null }),
        op(3, 'library_entry', { favourite: true }),
        op(4, 'list', { name: 'Top 10' }),
      ])}`.execute(db);

    await migrateToLatest(db);

    const { rows: entries } = await sql<{ id: string; rating: number | null }>`
      SELECT id, rating FROM library_entries ORDER BY id`.execute(db);
    expect(entries).toEqual([
      { id: 'rated', rating: 70 },
      { id: 'unrated', rating: null },
    ]);
    const { rows: ops } = await sql<{ fields: unknown; schema_version: number }>`
      SELECT fields, schema_version FROM ops ORDER BY seq`.execute(db);
    expect(ops).toEqual([
      { fields: { rating: 70, status: 'playing' }, schema_version: 2 },
      { fields: { rating: null }, schema_version: 2 },
      { fields: { favourite: true }, schema_version: 2 },
      { fields: { name: 'Top 10' }, schema_version: 2 },
    ]);
    await db.destroy();
  });
});
