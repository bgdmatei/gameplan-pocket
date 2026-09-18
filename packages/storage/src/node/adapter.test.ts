import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SqlParams, StorageAdapter } from '../adapter';
import { createNodeAdapter } from './adapter';

const CREATE = 'CREATE TABLE things (id TEXT PRIMARY KEY, name TEXT, flag INTEGER, note TEXT)';

describe('createNodeAdapter', () => {
  let adapter: StorageAdapter;

  beforeEach(async () => {
    adapter = createNodeAdapter();
    await adapter.execute(CREATE);
  });

  afterEach(async () => {
    await adapter.close();
  });

  describe('execute', () => {
    it('returns plain objects, not null-prototype rows', async () => {
      await adapter.execute('INSERT INTO things (id, name) VALUES (?, ?)', ['a', 'Witcher']);
      const rows = await adapter.execute<{ id: string; name: string }>('SELECT * FROM things');

      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({ id: 'a', name: 'Witcher', flag: null, note: null });
      expect(Object.getPrototypeOf(rows[0])).toBe(Object.prototype);
    });

    it('returns an empty list for a write', async () => {
      expect(await adapter.execute('INSERT INTO things (id) VALUES (?)', ['a'])).toEqual([]);
    });

    it('binds strings, numbers and null', async () => {
      await adapter.execute('INSERT INTO things (id, name, flag, note) VALUES (?, ?, ?, ?)', [
        'a',
        'Witcher',
        3,
        null,
      ]);

      expect(await adapter.execute('SELECT * FROM things')).toEqual([
        { id: 'a', name: 'Witcher', flag: 3, note: null },
      ]);
    });

    it('binds booleans as 0 and 1, which SQLite would otherwise reject', async () => {
      await adapter.execute('INSERT INTO things (id, flag) VALUES (?, ?)', ['yes', true]);
      await adapter.execute('INSERT INTO things (id, flag) VALUES (?, ?)', ['no', false]);

      expect(await adapter.execute('SELECT id, flag FROM things ORDER BY id')).toEqual([
        { id: 'no', flag: 0 },
        { id: 'yes', flag: 1 },
      ]);
    });

    it('rejects undefined rather than storing null by accident', async () => {
      // The types already forbid this; the cast covers callers without them,
      // and a mapping bug that produces undefined for a missing field.
      const params = ['a', undefined] as unknown as SqlParams;

      await expect(
        adapter.execute('INSERT INTO things (id, name) VALUES (?, ?)', params),
      ).rejects.toThrow(/undefined/i);
    });

    it('reports the failing SQL when a statement is invalid', async () => {
      await expect(adapter.execute('SELECT * FROM missing_table')).rejects.toThrow(/missing_table/);
    });
  });

  describe('transaction', () => {
    it('commits when the callback returns', async () => {
      const result = await adapter.transaction(async (tx) => {
        await tx.execute('INSERT INTO things (id) VALUES (?)', ['a']);
        await tx.execute('INSERT INTO things (id) VALUES (?)', ['b']);
        return 'done';
      });

      expect(result).toBe('done');
      expect(await adapter.execute('SELECT id FROM things ORDER BY id')).toEqual([
        { id: 'a' },
        { id: 'b' },
      ]);
    });

    it('rolls everything back when the callback throws, and re-throws', async () => {
      await expect(
        adapter.transaction(async (tx) => {
          await tx.execute('INSERT INTO things (id) VALUES (?)', ['a']);
          throw new Error('changed my mind');
        }),
      ).rejects.toThrow('changed my mind');

      expect(await adapter.execute('SELECT id FROM things')).toEqual([]);
    });

    it('rolls back when a statement inside fails', async () => {
      await expect(
        adapter.transaction(async (tx) => {
          await tx.execute('INSERT INTO things (id) VALUES (?)', ['a']);
          await tx.execute('INSERT INTO things (id) VALUES (?)', ['a']);
        }),
      ).rejects.toThrow();

      expect(await adapter.execute('SELECT id FROM things')).toEqual([]);
    });

    it('refuses a nested transaction instead of silently flattening it', async () => {
      await expect(
        adapter.transaction(async () => {
          await adapter.transaction(async () => undefined);
        }),
      ).rejects.toThrow(/nested/i);
    });

    it('can start a new transaction after one failed', async () => {
      await expect(
        adapter.transaction(async () => {
          throw new Error('first');
        }),
      ).rejects.toThrow('first');

      await adapter.transaction(async (tx) => {
        await tx.execute('INSERT INTO things (id) VALUES (?)', ['a']);
      });

      expect(await adapter.execute('SELECT id FROM things')).toEqual([{ id: 'a' }]);
    });
  });

  describe('subscribe', () => {
    it('notifies after a write commits', async () => {
      const listener = vi.fn();
      adapter.subscribe(['things'], listener);

      await adapter.execute('INSERT INTO things (id) VALUES (?)', ['a']);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('notifies once per transaction, not once per row', async () => {
      const listener = vi.fn();
      adapter.subscribe(['things'], listener);

      await adapter.transaction(async (tx) => {
        for (const id of ['a', 'b', 'c']) {
          await tx.execute('INSERT INTO things (id) VALUES (?)', [id]);
        }
      });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('stays quiet when a transaction rolls back', async () => {
      const listener = vi.fn();
      adapter.subscribe(['things'], listener);

      await expect(
        adapter.transaction(async (tx) => {
          await tx.execute('INSERT INTO things (id) VALUES (?)', ['a']);
          throw new Error('no');
        }),
      ).rejects.toThrow();

      expect(listener).not.toHaveBeenCalled();
    });

    it('stays quiet for a transaction that only reads', async () => {
      const listener = vi.fn();
      adapter.subscribe(['things'], listener);

      await adapter.transaction(async (tx) => {
        await tx.execute('SELECT * FROM things');
      });

      expect(listener).not.toHaveBeenCalled();
    });

    it('stays quiet for reads', async () => {
      const listener = vi.fn();
      adapter.subscribe(['things'], listener);

      await adapter.execute('SELECT * FROM things');

      expect(listener).not.toHaveBeenCalled();
    });

    it('only notifies listeners of the tables that changed', async () => {
      await adapter.execute('CREATE TABLE others (id TEXT)');
      const onThings = vi.fn();
      const onOthers = vi.fn();
      adapter.subscribe(['things'], onThings);
      adapter.subscribe(['others'], onOthers);

      await adapter.execute('INSERT INTO things (id) VALUES (?)', ['a']);

      expect(onThings).toHaveBeenCalledTimes(1);
      expect(onOthers).not.toHaveBeenCalled();
    });

    it('stops delivering once unsubscribed', async () => {
      const listener = vi.fn();
      const unsubscribe = adapter.subscribe(['things'], listener);

      unsubscribe();
      await adapter.execute('INSERT INTO things (id) VALUES (?)', ['a']);

      expect(listener).not.toHaveBeenCalled();
    });

    it('survives a listener that throws, so one bad screen cannot block others', async () => {
      const broken = vi.fn(() => {
        throw new Error('listener blew up');
      });
      const healthy = vi.fn();
      adapter.subscribe(['things'], broken);
      adapter.subscribe(['things'], healthy);

      await adapter.execute('INSERT INTO things (id) VALUES (?)', ['a']);

      expect(healthy).toHaveBeenCalledTimes(1);
    });
  });

  describe('close', () => {
    it('can be called twice', async () => {
      await adapter.close();
      await expect(adapter.close()).resolves.toBeUndefined();
    });

    it('refuses queries once closed', async () => {
      await adapter.close();
      await expect(adapter.execute('SELECT 1')).rejects.toThrow(/closed/i);
    });
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
    await first.execute(CREATE);
    await first.execute('INSERT INTO things (id) VALUES (?)', ['a']);
    await first.close();

    const second = createNodeAdapter({ path });
    expect(await second.execute('SELECT id FROM things')).toEqual([{ id: 'a' }]);
    await second.close();
  });
});
