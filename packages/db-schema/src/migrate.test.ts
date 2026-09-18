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

    expect(result).toEqual({ from: 0, to: LATEST_SCHEMA_VERSION, applied: [1] });
    expect(userVersion(database)).toBe(LATEST_SCHEMA_VERSION);
  });

  it('creates every table the app needs', async () => {
    await migrate(executor);

    expect(tableNames(database)).toEqual(
      expect.arrayContaining([
        'library_entries',
        'entry_tags',
        'note_items',
        'note_conflicts',
        'lists',
        'list_items',
        'games',
        'genres',
        'platforms',
        'game_genres',
        'game_platforms',
        'games_fts',
        'pending_ops',
        'sync_state',
      ]),
    );
  });

  it('does nothing on a database that is already up to date', async () => {
    await migrate(executor);
    const before = tableNames(database);

    const second = await migrate(executor);

    expect(second).toEqual({ from: LATEST_SCHEMA_VERSION, to: LATEST_SCHEMA_VERSION, applied: [] });
    expect(tableNames(database)).toEqual(before);
  });

  it('applies only what is missing', async () => {
    const first: Migration = { number: 1, name: 'one', statements: ['CREATE TABLE one (id TEXT)'] };
    const second: Migration = {
      number: 2,
      name: 'two',
      statements: ['CREATE TABLE two (id TEXT)'],
    };

    await migrate(executor, [first]);
    const result = await migrate(executor, [first, second]);

    expect(result).toEqual({ from: 1, to: 2, applied: [2] });
  });

  it('applies migrations in order, whatever order they are listed in', async () => {
    const one: Migration = { number: 1, name: 'one', statements: ['CREATE TABLE one (id TEXT)'] };
    const two: Migration = {
      number: 2,
      name: 'two',
      statements: ['CREATE TABLE two (id TEXT REFERENCES one (id))'],
    };

    const result = await migrate(executor, [two, one]);

    expect(result.applied).toEqual([1, 2]);
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

  it('checks the list before touching the database', async () => {
    const good: Migration = { number: 1, name: 'one', statements: ['CREATE TABLE one (id TEXT)'] };
    const bad: Migration = { number: -1, name: 'bad', statements: ['SELECT 1'] };

    await expect(migrate(executor, [good, bad])).rejects.toThrow(/positive integer/);
    expect(userVersion(database)).toBe(0);
    expect(tableNames(database)).not.toContain('one');
  });
});

describe('schema', () => {
  let database: DatabaseSync;

  beforeEach(async () => {
    database = new DatabaseSync(':memory:');
    await migrate(createTestExecutor(database));
  });

  it('keeps full-text search in step with the games table', () => {
    const search = (term: string): string[] =>
      (
        database
          .prepare('SELECT name FROM games_fts WHERE games_fts MATCH ? ORDER BY rank')
          .all(term) as { name: string }[]
      ).map((row) => row.name);

    database
      .prepare("INSERT INTO games (id, name, slug, fetched_at) VALUES (?, ?, ?, '2026-09-18')")
      .run(1, "Assassin's Creed II", 'assassins-creed-ii');

    expect(search('creed')).toEqual(["Assassin's Creed II"]);

    database.prepare('UPDATE games SET name = ? WHERE id = 1').run('Baldur’s Gate 3');
    expect(search('creed')).toEqual([]);
    expect(search('baldur')).toEqual(['Baldur’s Gate 3']);

    database.prepare('DELETE FROM games WHERE id = 1').run();
    expect(search('baldur')).toEqual([]);
  });

  it('allows exactly one sync_state row, seeded with defaults', () => {
    const rows = database.prepare('SELECT * FROM sync_state').all() as {
      id: number;
      last_pulled_seq: number;
      node_id: string | null;
    }[];

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 1, last_pulled_seq: 0, node_id: null });
    expect(() => database.prepare('INSERT INTO sync_state (id) VALUES (2)').run()).toThrow();
  });

  it('allows one library entry per game', () => {
    const insert = database.prepare(
      `INSERT INTO library_entries (id, game_id, status, created_at, updated_at)
       VALUES (?, ?, 'backlog', '2026-09-18T10:00:00Z', '2026-09-18T10:00:00Z')`,
    );

    insert.run('entry-1', 1942);
    expect(() => insert.run('entry-2', 1942)).toThrow();
  });

  it('keeps pending ops in insertion order', () => {
    const insert = database.prepare(
      'INSERT INTO pending_ops (id, payload, created_at) VALUES (?, ?, ?)',
    );
    insert.run('op-2', '{"a":1}', '2026-09-18T10:00:02Z');
    insert.run('op-1', '{"a":2}', '2026-09-18T10:00:01Z');

    const ops = database.prepare('SELECT id FROM pending_ops ORDER BY seq').all() as {
      id: string;
    }[];

    expect(ops.map((op) => op.id)).toEqual(['op-2', 'op-1']);
  });

  it('uses an index for the library grid query', () => {
    const plan = (
      database
        .prepare(
          `EXPLAIN QUERY PLAN
           SELECT id FROM library_entries WHERE deleted = 0 ORDER BY updated_at DESC LIMIT 50`,
        )
        .all() as { detail: string }[]
    )
      .map((row) => row.detail)
      .join(' ');

    expect(plan).toMatch(/USING INDEX/);
    expect(plan).not.toMatch(/SCAN library_entries(?! USING)/);
  });
});
