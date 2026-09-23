import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { LATEST_SCHEMA_VERSION, MIGRATIONS } from './migrations/index';
import type { Migration, MigrationExecutor } from './migrations/types';
import { migrate } from './migrate';

/**
 * Minimal executor over node:sqlite. The real adapters live in
 * `@gameplan/storage`, which this package must not depend on, so migrations
 * are tested against the smallest thing that satisfies the interface.
 */
const createTestExecutor = (database: DatabaseSync): MigrationExecutor => {
  const returnsRows = (sql: string): boolean => /^\s*(select|pragma|explain|with)/i.test(sql);

  const executor: MigrationExecutor = {
    execute: async <T>(sql: string, params: readonly unknown[] = []): Promise<T[]> => {
      if (returnsRows(sql)) {
        return database.prepare(sql).all(...(params as never[])) as T[];
      }
      database.prepare(sql).run(...(params as never[]));
      return [];
    },
    transaction: async <T>(fn: (tx: MigrationExecutor) => Promise<T>): Promise<T> => {
      database.exec('BEGIN');
      try {
        const result = await fn(executor);
        database.exec('COMMIT');
        return result;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  };

  return executor;
};

const tableNames = (database: DatabaseSync): string[] =>
  (
    database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
      name: string;
    }[]
  ).map((row) => row.name);

const userVersion = (database: DatabaseSync): number =>
  (database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;

describe('migrate', () => {
  let database: DatabaseSync;
  let executor: MigrationExecutor;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    executor = createTestExecutor(database);
  });

  it('brings a fresh database to the latest version', async () => {
    const result = await migrate(executor);

    expect(result).toEqual({
      from: 0,
      to: LATEST_SCHEMA_VERSION,
      applied: MIGRATIONS.map(({ number }) => number),
    });
    expect(userVersion(database)).toBe(LATEST_SCHEMA_VERSION);
  });

  it('does nothing on a database that is already up to date', async () => {
    await migrate(executor);
    const before = tableNames(database);

    const second = await migrate(executor);

    expect(second).toEqual({ from: LATEST_SCHEMA_VERSION, to: LATEST_SCHEMA_VERSION, applied: [] });
    expect(tableNames(database)).toEqual(before);
  });

  it('rolls a failing migration back whole, leaving the version untouched', async () => {
    await migrate(executor);
    const before = tableNames(database);

    const broken: Migration = {
      number: 2,
      name: 'broken',
      statements: ['CREATE TABLE half_done (id TEXT)', 'THIS IS NOT SQL'],
    };

    await expect(migrate(executor, [...MIGRATIONS, broken])).rejects.toThrow();

    expect(userVersion(database)).toBe(LATEST_SCHEMA_VERSION);
    expect(tableNames(database)).toEqual(before);
    expect(tableNames(database)).not.toContain('half_done');
  });

  it('refuses a migration numbered zero or lower', async () => {
    const invalid: Migration = { number: 0, name: 'bad', statements: ['SELECT 1'] };

    await expect(migrate(executor, [invalid])).rejects.toThrow(/positive integer/);
  });

  it('refuses two migrations sharing a number, which would silently skip one', async () => {
    const one: Migration = { number: 1, name: 'one', statements: ['CREATE TABLE one (id TEXT)'] };
    const clash: Migration = {
      number: 1,
      name: 'clash',
      statements: ['CREATE TABLE two (id TEXT)'],
    };

    await expect(migrate(executor, [one, clash])).rejects.toThrow(/share the number 1/);
  });
});

describe('schema', () => {
  let database: DatabaseSync;

  beforeEach(async () => {
    database = new DatabaseSync(':memory:');
    await migrate(createTestExecutor(database));
  });

  it('finds a game whether or not the apostrophe is typed', () => {
    const search = (term: string): string[] =>
      (
        database
          .prepare('SELECT name FROM games_fts WHERE games_fts MATCH ? ORDER BY rank')
          .all(term) as { name: string }[]
      ).map((row) => row.name);

    database
      .prepare("INSERT INTO games (id, name, slug, fetched_at) VALUES (?, ?, ?, '2026-09-20')")
      .run(1, "Assassin's Creed II", 'assassins-creed-ii');
    database
      .prepare("INSERT INTO games (id, name, slug, fetched_at) VALUES (?, ?, ?, '2026-09-20')")
      .run(2, 'Baldur’s Gate 3', 'baldurs-gate-3');

    // Straight and curly apostrophes, typed and not typed.
    expect(search('"assassins"*')).toEqual(["Assassin's Creed II"]);
    expect(search('"assassin" "s"*')).toEqual(["Assassin's Creed II"]);
    expect(search('"baldurs"*')).toEqual(['Baldur’s Gate 3']);
    expect(search('"baldur"*')).toEqual(['Baldur’s Gate 3']);
  });

  it('reindexes games cached before the search migration ran', async () => {
    const fresh = new DatabaseSync(':memory:');
    const executor = createTestExecutor(fresh);
    await migrate(
      executor,
      MIGRATIONS.filter(({ number }) => number === 1),
    );

    fresh
      .prepare("INSERT INTO games (id, name, slug, fetched_at) VALUES (?, ?, ?, '2026-09-20')")
      .run(1, "Assassin's Creed II", 'assassins-creed-ii');

    await migrate(executor);

    const rows = fresh
      .prepare('SELECT name FROM games_fts WHERE games_fts MATCH ?')
      .all('"assassins"*') as { name: string }[];
    expect(rows.map((row) => row.name)).toEqual(["Assassin's Creed II"]);
  });

  it('allows one library entry per game', () => {
    const insert = database.prepare(
      `INSERT INTO library_entries (id, game_id, status, created_at, updated_at)
       VALUES (?, ?, 'backlog', '2026-09-18T10:00:00Z', '2026-09-18T10:00:00Z')`,
    );

    insert.run('entry-1', 1942);
    expect(() => insert.run('entry-2', 1942)).toThrow();
  });
});
