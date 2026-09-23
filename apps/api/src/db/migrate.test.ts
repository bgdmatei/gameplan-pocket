import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../testing/database';
import { migrateToLatest } from './migrate';

describe('migrateToLatest', () => {
  it('brings a fresh database up to date, and a second run changes nothing', async () => {
    // createTestDb has already run every migration once.
    const db = await createTestDb();

    expect(await migrateToLatest(db)).toEqual([]);
    // Fuzzy search rests on pg_trgm, which the first migration enables.
    const { rows } = await sql<{
      score: number;
    }>`SELECT similarity('witcher', 'witchr') AS score`.execute(db);
    expect(rows[0]?.score).toBeGreaterThan(0);
    await db.destroy();
  });
});
