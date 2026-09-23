import { createEntry } from '@gameplan/domain';
import {
  countPendingOps,
  createMigratedNodeAdapter,
  getLibraryEntry,
  getSyncState,
  listPendingOps,
} from '@gameplan/storage';
import { describe, expect, it } from 'vitest';
import { entryId } from '../ids';
import { fakeEnv } from '../testing/env';
import { commitLocalChange, commitLocalCreate } from './commit';

const entry = createEntry(
  { id: entryId(1942), gameId: 1942, status: 'playing', createdAt: '2026-09-23T10:00:00.000Z' },
  { today: '2026-09-23' },
);

describe('commitLocalChange', () => {
  it('writes nothing for an edit that changed nothing', async () => {
    const adapter = await createMigratedNodeAdapter();

    const op = await commitLocalChange(adapter, fakeEnv(), {
      entity: 'library_entry',
      next: entry,
      changed: {},
    });

    expect(op).toBeNull();
    expect(await countPendingOps(adapter)).toBe(0);
    expect((await getSyncState(adapter)).hlcLast).toBeNull();
  });

  /**
   * The guarantee the glue exists for: a row saved without its op would never
   * sync, and a clock given out but not remembered could be issued twice.
   */
  it('lands the row, its clocks, the op and the clock state together, or none of them', async () => {
    const adapter = await createMigratedNodeAdapter();
    // Constant bytes and a frozen clock: the second commit gets the same op
    // id, so its outbox insert fails after the row has been written.
    const env = { ...fakeEnv(), randomBytes: (length: number) => new Uint8Array(length) };

    const op = await commitLocalCreate(adapter, env, { entity: 'library_entry', next: entry });

    const [pending] = await listPendingOps(adapter);
    expect(JSON.parse(pending?.payload ?? '')).toEqual(op);
    expect((await getSyncState(adapter)).hlcLast).toBe(op.hlc);

    await expect(
      commitLocalChange(adapter, env, {
        entity: 'library_entry',
        next: { ...entry, rating: 9 },
        changed: { rating: 9 },
      }),
    ).rejects.toThrow();

    expect(await getLibraryEntry(adapter, entry.id)).toEqual(entry);
    expect(await countPendingOps(adapter)).toBe(1);
    expect((await getSyncState(adapter)).hlcLast).toBe(op.hlc);
  });
});
