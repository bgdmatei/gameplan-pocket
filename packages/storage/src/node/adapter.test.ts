import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodeAdapter } from './adapter';

/**
 * Shared behaviour lives in the adapter contract (`adapter.suite.test.ts`).
 * This covers what is specific to node:sqlite, plus notification scheduling,
 * which needs an injected scheduler to be deterministic.
 */
describe('node adapter', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'gameplan-storage-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('keeps data across connections, with WAL and foreign keys on', async () => {
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

  /** Sign-out on a shared device must leave nothing for the next person. */
  it('leaves nothing readable in the file after destroy', async () => {
    const path = join(directory, 'library.db');

    const first = createNodeAdapter({ path });
    await first.execute('CREATE TABLE note_items (id TEXT PRIMARY KEY, text TEXT)');
    await first.execute('INSERT INTO note_items (id, text) VALUES (?, ?)', [
      'n1',
      'the code is 246',
    ]);
    await first.destroy();

    const second = createNodeAdapter({ path });
    expect(await second.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).toEqual([]);
    await second.close();
  });
});

describe('notification scheduling', () => {
  it('batches until the scheduler fires, then schedules again for later changes', async () => {
    const flushes: (() => void)[] = [];
    const adapter = createNodeAdapter({ scheduleNotify: (flush) => flushes.push(flush) });
    await adapter.execute('CREATE TABLE things (id TEXT PRIMARY KEY)');

    let calls = 0;
    const unsubscribe = adapter.subscribe(['things'], () => {
      calls += 1;
    });

    await adapter.execute('INSERT INTO things (id) VALUES (?)', ['a']);
    await adapter.execute('INSERT INTO things (id) VALUES (?)', ['b']);
    expect({ calls, scheduled: flushes.length }).toEqual({ calls: 0, scheduled: 1 });

    flushes[0]?.();
    expect(calls).toBe(1);

    await adapter.execute('INSERT INTO things (id) VALUES (?)', ['c']);
    flushes[1]?.();
    expect(calls).toBe(2);

    // A screen that closed between the write and the repaint hears nothing.
    unsubscribe();
    await adapter.execute('INSERT INTO things (id) VALUES (?)', ['d']);
    flushes[2]?.();
    expect(calls).toBe(2);

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
