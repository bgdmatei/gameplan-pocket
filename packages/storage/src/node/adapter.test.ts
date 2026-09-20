import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodeAdapter } from './adapter';

/**
 * Shared behaviour lives in the adapter contract (`adapter.suite.test.ts`), so
 * this file covers only what is specific to node:sqlite: opening a file,
 * journal mode, foreign keys, and surviving a reconnect.
 */
describe('notification scheduling', () => {
  it('delivers nothing until the scheduler runs the flush', async () => {
    const flushes: (() => void)[] = [];
    const adapter = createNodeAdapter({ scheduleNotify: (flush) => flushes.push(flush) });
    await adapter.execute('CREATE TABLE things (id TEXT PRIMARY KEY)');

    let calls = 0;
    adapter.subscribe(['things'], () => {
      calls += 1;
    });

    await adapter.execute('INSERT INTO things (id) VALUES (?)', ['a']);
    await adapter.execute('INSERT INTO things (id) VALUES (?)', ['b']);
    expect(calls).toBe(0);

    // One flush was scheduled for both writes, not two.
    expect(flushes).toHaveLength(1);
    flushes[0]?.();
    expect(calls).toBe(1);

    await adapter.close();
  });

  it('schedules again for changes made after a flush', async () => {
    const flushes: (() => void)[] = [];
    const adapter = createNodeAdapter({ scheduleNotify: (flush) => flushes.push(flush) });
    await adapter.execute('CREATE TABLE things (id TEXT PRIMARY KEY)');

    let calls = 0;
    adapter.subscribe(['things'], () => {
      calls += 1;
    });

    await adapter.execute('INSERT INTO things (id) VALUES (?)', ['a']);
    flushes[0]?.();
    await adapter.execute('INSERT INTO things (id) VALUES (?)', ['b']);
    flushes[1]?.();

    expect(calls).toBe(2);
    await adapter.close();
  });

  it('reports every table touched since the last delivery', async () => {
    const flushes: (() => void)[] = [];
    const adapter = createNodeAdapter({ scheduleNotify: (flush) => flushes.push(flush) });
    await adapter.execute('CREATE TABLE things (id TEXT PRIMARY KEY)');
    await adapter.execute('CREATE TABLE others (id TEXT PRIMARY KEY)');

    let things = 0;
    let others = 0;
    adapter.subscribe(['things'], () => {
      things += 1;
    });
    adapter.subscribe(['others'], () => {
      others += 1;
    });

    await adapter.execute('INSERT INTO things (id) VALUES (?)', ['a']);
    await adapter.execute('INSERT INTO others (id) VALUES (?)', ['b']);
    flushes[0]?.();

    expect({ things, others }).toEqual({ things: 1, others: 1 });
    await adapter.close();
  });

  it('does not deliver to a listener that unsubscribed before the flush', async () => {
    const flushes: (() => void)[] = [];
    const adapter = createNodeAdapter({ scheduleNotify: (flush) => flushes.push(flush) });
    await adapter.execute('CREATE TABLE things (id TEXT PRIMARY KEY)');

    let calls = 0;
    const unsubscribe = adapter.subscribe(['things'], () => {
      calls += 1;
    });

    await adapter.execute('INSERT INTO things (id) VALUES (?)', ['a']);
    // A screen closed between the write and the repaint.
    unsubscribe();
    flushes[0]?.();

    expect(calls).toBe(0);
    await adapter.close();
  });

  it('a flush arriving after close delivers nothing', async () => {
    const flushes: (() => void)[] = [];
    const adapter = createNodeAdapter({ scheduleNotify: (flush) => flushes.push(flush) });
    await adapter.execute('CREATE TABLE things (id TEXT PRIMARY KEY)');

    let calls = 0;
    adapter.subscribe(['things'], () => {
      calls += 1;
    });

    await adapter.execute('INSERT INTO things (id) VALUES (?)', ['a']);
    await adapter.close();
    expect(() => flushes[0]?.()).not.toThrow();

    expect(calls).toBe(0);
  });
});

describe('createNodeAdapter with a file', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'gameplan-storage-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('keeps data across connections and turns on WAL and foreign keys', async () => {
    const path = join(directory, 'library.db');

    const first = createNodeAdapter({ path });
    expect(await first.execute('PRAGMA journal_mode')).toEqual([{ journal_mode: 'wal' }]);
    expect(await first.execute('PRAGMA foreign_keys')).toEqual([{ foreign_keys: 1 }]);
    await first.execute('CREATE TABLE things (id TEXT PRIMARY KEY)');
    await first.execute('INSERT INTO things (id) VALUES (?)', ['a']);
    await first.close();

    const second = createNodeAdapter({ path });
    expect(await second.execute('SELECT id FROM things')).toEqual([{ id: 'a' }]);
    await second.close();
  });

  it('enforces foreign keys, which SQLite leaves off by default', async () => {
    const adapter = createNodeAdapter({ path: join(directory, 'fk.db') });
    await adapter.execute('CREATE TABLE parents (id TEXT PRIMARY KEY)');
    await adapter.execute(
      'CREATE TABLE children (id TEXT PRIMARY KEY, parent_id TEXT REFERENCES parents (id))',
    );

    await expect(
      adapter.execute('INSERT INTO children (id, parent_id) VALUES (?, ?)', ['c', 'missing']),
    ).rejects.toThrow();

    await adapter.close();
  });

  it('leaves nothing readable in the file after destroy, which is the sign-out path', async () => {
    const path = join(directory, 'library.db');

    const first = createNodeAdapter({ path });
    await first.execute('CREATE TABLE note_items (id TEXT PRIMARY KEY, text TEXT)');
    await first.execute('INSERT INTO note_items (id, text) VALUES (?, ?)', [
      'n1',
      'the code is 2-4-6',
    ]);
    await first.destroy();

    // Whoever opens the app next on this device must find an empty database.
    const second = createNodeAdapter({ path });
    expect(await second.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).toEqual([]);
    expect(await second.execute('PRAGMA user_version')).toEqual([{ user_version: 0 }]);
    await second.close();
  });

  it('uses an in-memory database by default, so tests never touch the disk', async () => {
    const adapter = createNodeAdapter();
    expect(await adapter.execute('PRAGMA journal_mode')).toEqual([{ journal_mode: 'memory' }]);
    await adapter.close();
  });
});
