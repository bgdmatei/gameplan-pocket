import type { StorageAdapter } from '@gameplan/storage';
import { createNodeAdapter } from '@gameplan/storage/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryRunner } from './query-runner';
import type { QueryState } from './query-runner';

const count = async (adapter: StorageAdapter, table: string): Promise<number> => {
  const [row] = await adapter.execute<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
  return row?.n ?? 0;
};

describe('createQueryRunner', () => {
  let adapter: StorageAdapter;

  beforeEach(async () => {
    adapter = createNodeAdapter();
    await adapter.execute('CREATE TABLE watched (id TEXT PRIMARY KEY)');
    await adapter.execute('CREATE TABLE other (id TEXT PRIMARY KEY)');
  });

  // The screen must follow the data: an edit that never shows up is a bug a
  // user notices at once, and so is a list re-running for unrelated writes.
  it('re-runs after a commit to a watched table, and only then', async () => {
    const results: number[] = [];
    let runs = 0;
    const stop = createQueryRunner(
      adapter,
      async (db) => {
        runs += 1;
        return count(db, 'watched');
      },
      ['watched'],
      (state) => {
        if (state.status === 'ready') results.push(state.data);
      },
    );
    await vi.waitFor(() => expect(results).toEqual([0]));

    await adapter.execute('INSERT INTO other (id) VALUES (?)', ['x']);
    await adapter.execute('INSERT INTO watched (id) VALUES (?)', ['a']);

    await vi.waitFor(() => expect(results).toEqual([0, 1]));
    expect(runs).toBe(2);
    stop();
  });

  it('never lets a slow earlier run overwrite a newer result', async () => {
    const states: QueryState<string>[] = [];
    let call = 0;
    // The first run answers last.
    const query = async (): Promise<string> => {
      call += 1;
      const mine = call;
      await new Promise((resolve) => setTimeout(resolve, mine === 1 ? 60 : 5));
      return `run ${String(mine)}`;
    };
    const stop = createQueryRunner(adapter, query, ['watched'], (state) => states.push(state));

    await adapter.execute('INSERT INTO watched (id) VALUES (?)', ['a']);
    await vi.waitFor(() => expect(states).toEqual([{ status: 'ready', data: 'run 2' }]));
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(states).toEqual([{ status: 'ready', data: 'run 2' }]);
    stop();
  });
});
