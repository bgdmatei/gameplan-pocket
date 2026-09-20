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
