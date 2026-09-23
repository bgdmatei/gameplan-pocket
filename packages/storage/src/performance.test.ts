import { migrate } from '@gameplan/db-schema';
import { beforeAll, describe, expect, it } from 'vitest';
import type { StorageAdapter } from './adapter';
import { createNodeAdapter } from './node/adapter';
import { listLibraryEntries } from './repositories/library-entries';
import { searchGames } from './repositories/games';
import { appendPendingOp } from './repositories/pending-ops';
import { seed } from './testing/seed';

/**
 * This module's slice of the performance budget (plan §12), measured against a
 * 5,000-entry library.
 *
 * These run in Node against node:sqlite, not on a phone, so they are a
 * regression guard rather than a promise about device performance: a query
 * that starts scanning the table will blow through these numbers anywhere.
 * T11 and T12 measure the real thing.
 *
 * Each measurement is the best of several runs. The best run is the one least
 * polluted by other work on the machine, which keeps CI from failing on noise
 * while still catching a real slowdown.
 */
const ENTRIES = 5_000;
const RUNS = 5;

/** Long enough for a scheduled notification to land (roughly a frame). */
const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 80));
};

const bestOf = async (runs: number, work: () => Promise<unknown>): Promise<number> => {
  let best = Number.POSITIVE_INFINITY;

  for (let run = 0; run < runs; run += 1) {
    const started = performance.now();
    await work();
    best = Math.min(best, performance.now() - started);
  }

  return best;
};

describe('performance against a 5,000-entry library', () => {
  let adapter: StorageAdapter;
  const timings: Record<string, number> = {};

  beforeAll(async () => {
    adapter = createNodeAdapter();
    await migrate(adapter);

    const started = performance.now();
    const result = await seed(adapter, { entries: ENTRIES });
    timings['seed'] = performance.now() - started;

    expect(result.entries).toBe(ENTRIES);
  }, 120_000);

  it('searches the catalog in under 50 ms, including as-you-type prefixes', async () => {
    for (const [name, query] of [
      ['search', 'shadow real'],
      ['search (prefix)', 'sha'],
    ] as const) {
      const elapsed = await bestOf(RUNS, () => searchGames(adapter, query, { limit: 20 }));
      timings[name] = elapsed;

      expect(elapsed, name).toBeLessThan(50);
    }
  });

  it('changes filter in under 100 ms', async () => {
    for (const [name, options] of [
      ['filter by status', { status: 'playing' as const, limit: 50 }],
      ['filter by tag', { tag: 'co-op', limit: 50 }],
    ] as const) {
      const elapsed = await bestOf(RUNS, () => listLibraryEntries(adapter, options));
      timings[name] = elapsed;

      expect(elapsed, name).toBeLessThan(100);
    }
  });

  it('sorts by any key in under 100 ms', async () => {
    for (const sort of ['recent', 'name', 'rating', 'playtime'] as const) {
      const elapsed = await bestOf(RUNS, () => listLibraryEntries(adapter, { sort, limit: 50 }));
      timings[`sort by ${sort}`] = elapsed;

      expect(elapsed, sort).toBeLessThan(100);
    }
  });

  it('pages deep into the library as fast as the first page', async () => {
    let cursor: string | undefined;
    for (let page = 0; page < 20; page += 1) {
      const result = await listLibraryEntries(adapter, { sort: 'name', limit: 50, cursor });
      cursor = result.nextCursor;
    }

    // The 21st page, a thousand rows in: keyset paging must not slow down,
    // which is the whole reason for not using OFFSET.
    const elapsed = await bestOf(RUNS, () =>
      listLibraryEntries(adapter, { sort: 'name', limit: 50, cursor }),
    );
    timings['page 21 of the library'] = elapsed;

    expect(elapsed).toBeLessThan(100);
  });

  it('applies 1,000 rows in one transaction without stalling', async () => {
    const started = performance.now();

    await adapter.transaction(async (tx) => {
      for (let index = 0; index < 1_000; index += 1) {
        await tx.execute('INSERT INTO pending_ops (id, payload, created_at) VALUES (?, ?, ?)', [
          `bulk-${String(index)}`,
          '{"kind":"set"}',
          '2026-09-20T10:00:00Z',
        ]);
      }
    });

    const elapsed = performance.now() - started;
    timings['apply 1,000 rows'] = elapsed;

    // A sync pull's batch: the budget is "the UI stays responsive", which here
    // means the write finishes well inside a second.
    expect(elapsed).toBeLessThan(1_000);
  });

  it('wakes a screen once for a 1,000-row transaction', async () => {
    let calls = 0;
    adapter.subscribe(['pending_ops'], () => {
      calls += 1;
    });

    await adapter.transaction(async (tx) => {
      for (let index = 0; index < 1_000; index += 1) {
        await tx.execute('INSERT INTO pending_ops (id, payload, created_at) VALUES (?, ?, ?)', [
          `batch-${String(index)}`,
          '{}',
          '2026-09-20T10:00:00Z',
        ]);
      }
    });

    // Delivery is scheduled about a frame out, so wait for it rather than
    // assuming it has already happened.
    await settle();
    expect(calls).toBe(1);

    // A write after that delivery falls in a later frame, so it wakes the
    // screen again: batching is a window, not a mute button.
    await appendPendingOp(adapter, {
      id: 'last',
      payload: '{}',
      createdAt: '2026-09-20T10:00:00Z',
    });
    await settle();
    expect(calls).toBe(2);
  });

  it('reports what it measured', () => {
    // Printed so a run shows the numbers, not just a pass. PERFORMANCE.md
    // records a snapshot of them.
    for (const [name, value] of Object.entries(timings)) {
      console.warn(`${name.padEnd(26)} ${value.toFixed(1)} ms`);
    }

    expect(Object.keys(timings).length).toBeGreaterThan(5);
  });
});
