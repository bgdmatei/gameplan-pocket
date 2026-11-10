import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { createTestDatabase } from '../testing/database';
import { migrateToLatest } from './migrate';

describe('migrateToLatest', () => {
  it('brings a fresh database up to date, and a second run changes nothing', async () => {
    // createTestDatabase has already run every migration once, as the migrator.
    const { app, migrator: db } = await createTestDatabase();
    await app.destroy();

    expect(await migrateToLatest(db)).toEqual([]);
    // Fuzzy search rests on pg_trgm, which the first migration enables.
    const { rows } = await sql<{
      score: number;
    }>`SELECT similarity('witcher', 'witchr') AS score`.execute(db);
    expect(rows[0]?.score).toBeGreaterThan(0);
    await db.destroy();
  });
});
