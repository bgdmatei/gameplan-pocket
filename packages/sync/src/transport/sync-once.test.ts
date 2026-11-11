import type { SnapshotRow } from '@gameplan/contracts';
import { createList } from '@gameplan/domain';
import {
  SYNCED_ROWS,
  getSyncState,
  listPendingOps,
  listRejectedOps,
  readSyncedRow,
} from '@gameplan/storage';
import { createMigratedNodeAdapter } from '@gameplan/storage/node';
import { describe, expect, it } from 'vitest';
import { formatHlc } from '../clock/hlc';
import { commitLocalCreate } from '../store/commit';
import { fakeEnv } from '../testing/env';
import { syncOnce } from './sync-once';
import type { SyncApi } from './sync-once';

/** A server with an empty account: nothing to snapshot, nothing to pull. */
const emptyServer = (overrides: Partial<SyncApi> = {}) => {
  const calls = { push: 0, snapshot: 0, pull: 0 };
  const api: SyncApi = {
    push: async (ops) => {
      calls.push += 1;
      return { accepted: ops.map((op) => (op as { id: string }).id), rejected: [], lastSeq: 0 };
    },
    snapshot: async () => {
      calls.snapshot += 1;
      return { rows: [], seq: 0, nextCursor: null };
    },
    pull: async ({ after }) => {
      calls.pull += 1;
      return { ops: [], lastSeq: after, hasMore: false };
    },
    ...overrides,
  };
  return { api, calls };
};

describe('syncOnce', () => {
  it('keeps the outbox whole when a push fails', async () => {
    const adapter = await createMigratedNodeAdapter();
    const env = fakeEnv();
    const list = createList({ id: 'l-1', name: 'Co-op', createdAt: '2026-09-23T10:00:00.000Z' });
    await commitLocalCreate(adapter, env, { entity: 'list', next: list });
    const { api } = emptyServer({
      push: async () => {
        throw new Error('offline');
      },
    });

    await expect(syncOnce({ adapter, env, api })).rejects.toThrow('offline');

    expect(await listPendingOps(adapter)).toHaveLength(1);
    expect((await getSyncState(adapter)).lastSyncedAt).toBeNull();
  });

  // An empty account has nothing in its log, so "lastPulledSeq is 0" can't
  // tell a fresh device from a bootstrapped one; the flag does.
  it('bootstraps from the snapshot once, even for an empty account', async () => {
    const adapter = await createMigratedNodeAdapter();
    const env = fakeEnv();
    const { api, calls } = emptyServer();

    await syncOnce({ adapter, env, api });
    await syncOnce({ adapter, env, api });

    expect(calls.snapshot).toBe(1);
    expect(await getSyncState(adapter)).toMatchObject({
      bootstrapped: true,
      lastSyncedAt: new Date(env.now()).toISOString(),
    });
  });

  // Review of #19: a create dropped for a fast clock left its later edits
  // stranded on other devices. Only refusals that can never pass are moved.
  it('keeps an op refused for a fast clock in the outbox, and moves a bad one out', async () => {
    const adapter = await createMigratedNodeAdapter();
    const env = fakeEnv();
    for (const id of ['l-1', 'l-2']) {
      const list = createList({ id, name: id, createdAt: '2026-09-23T10:00:00.000Z' });
      await commitLocalCreate(adapter, env, { entity: 'list', next: list });
    }
    const queued = await listPendingOps(adapter);
    const { api } = emptyServer({
      push: async (ops) => ({
        accepted: [],
        rejected: [
          { index: 0, opId: (ops[0] as { id: string }).id, reason: 'invalid_op' },
          { index: 1, opId: (ops[1] as { id: string }).id, reason: 'clock_ahead' },
        ],
        lastSeq: 0,
      }),
    });

    await syncOnce({ adapter, env, api });

    expect((await listPendingOps(adapter)).map((op) => op.id)).toEqual([queued[1]?.id]);
    expect((await listRejectedOps(adapter)).map((op) => op.id)).toEqual([queued[0]?.id]);
  });

  // Review of #19: a delete whose create never reached the log arrives as a
  // tombstone with no fields; refusing it made bootstrap fail forever.
  it('bootstraps past a deleted row it never had', async () => {
    const adapter = await createMigratedNodeAdapter();
    const env = fakeEnv();
    const hlc = formatHlc({ wallMs: env.now(), counter: 0, nodeId: '3f9a2c1b7d4e8f60' });
    const { api } = emptyServer({
      snapshot: async () => ({
        rows: [
          { entity: 'list', id: 'gone', fields: {}, fieldHlc: { $delete: hlc }, deleted: true },
        ],
        seq: 1,
        nextCursor: null,
      }),
    });

    await syncOnce({ adapter, env, api });

    expect(await getSyncState(adapter)).toMatchObject({ bootstrapped: true, lastPulledSeq: 1 });
    expect(
      await adapter.transaction((tx) => readSyncedRow(tx, SYNCED_ROWS.lists, 'gone')),
    ).toBeNull();
  });

  // #26: rows whose create never reached the log (the Debug seed wrote some)
  // made a second device's bootstrap throw on every sync. They're skipped and
  // counted; the complete rows beside them land, and the device moves on.
  it('bootstraps and pulls past rows it cannot complete', async () => {
    const adapter = await createMigratedNodeAdapter();
    const env = fakeEnv();
    const hlc = formatHlc({ wallMs: env.now(), counter: 0, nodeId: '3f9a2c1b7d4e8f60' });
    const listFields = {
      name: 'Co-op',
      description: null,
      createdAt: '2026-09-23T10:00:00.000Z',
    };
    const rows: SnapshotRow[] = [
      {
        entity: 'library_entry',
        id: 'entry-30151665',
        fields: { rating: 7 },
        fieldHlc: { rating: hlc },
        deleted: false,
      },
      {
        entity: 'list',
        id: 'l-1',
        fields: listFields,
        fieldHlc: { name: hlc, description: hlc, createdAt: hlc },
        deleted: false,
      },
    ];
    const { api } = emptyServer({
      snapshot: async () => ({ rows, seq: 2, nextCursor: null }),
      pull: async ({ after }) =>
        after === 2
          ? {
              ops: [
                {
                  seq: 3,
                  op: {
                    id: '01890a5d-ac96-774b-bcce-b302099a8057',
                    entity: 'library_entry',
                    entityId: 'entry-20001528',
                    type: 'set',
                    fields: { platformId: 6 },
                    hlc,
                    schemaVersion: 1,
                  },
                },
              ],
              lastSeq: 3,
              hasMore: false,
            }
          : { ops: [], lastSeq: after, hasMore: false },
    });

    expect(await syncOnce({ adapter, env, api })).toMatchObject({ pulled: 1, skipped: 2 });

    expect(await getSyncState(adapter)).toMatchObject({ bootstrapped: true, lastPulledSeq: 3 });
    const read = (id: string) =>
      adapter.transaction((tx) => readSyncedRow(tx, SYNCED_ROWS.library_entries, id));
    expect(await read('entry-30151665')).toBeNull();
    expect(await read('entry-20001528')).toBeNull();
    expect(
      (await adapter.transaction((tx) => readSyncedRow(tx, SYNCED_ROWS.lists, 'l-1')))?.value,
    ).toMatchObject({ name: 'Co-op' });
  });
});
