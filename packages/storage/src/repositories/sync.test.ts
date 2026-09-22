import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from '@gameplan/db-schema';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StorageAdapter } from '../adapter';
import { createNodeAdapter } from '../node/adapter';
import { appendPendingOp, countPendingOps, deletePendingOps, listPendingOps } from './pending-ops';
import { getSyncState, updateSyncState } from './sync-state';

const NOW = '2026-09-20T10:00:00Z';

describe('outbox', () => {
  let adapter: StorageAdapter;

  beforeEach(async () => {
    adapter = createNodeAdapter();
    await migrate(adapter);
  });

  /**
   * Order comes from a sequence, not a timestamp: two edits in the same
   * millisecond still have an order, and a clock that jumps backwards does not
   * reorder the queue.
   */
  it('returns ops in the order written, whatever their ids and timestamps say', async () => {
    await appendPendingOp(adapter, { id: 'z', payload: '{}', createdAt: NOW });
    await appendPendingOp(adapter, { id: 'a', payload: '{}', createdAt: '2026-01-01T00:00:00Z' });

    expect((await listPendingOps(adapter)).map((op) => op.id)).toEqual(['z', 'a']);
  });

  it('hands the payload back exactly as given, since sync owns its format', async () => {
    const payload = JSON.stringify({
      text: 'He said "don\'t" \\ then left\nline two',
      emoji: '🎮',
    });

    await appendPendingOp(adapter, { id: 'op-1', payload, createdAt: NOW });

    expect((await listPendingOps(adapter))[0]?.payload).toBe(payload);
  });

  it('deletes only what was acknowledged, and ignores ids it does not hold', async () => {
    for (const id of ['a', 'b', 'c']) {
      await appendPendingOp(adapter, { id, payload: '{}', createdAt: NOW });
    }

    // A retried acknowledgement must be harmless: retries are normal.
    await deletePendingOps(adapter, ['a', 'c', 'never-existed']);

    expect((await listPendingOps(adapter)).map((op) => op.id)).toEqual(['b']);
    expect(await countPendingOps(adapter)).toBe(1);
  });

  it('refuses a duplicate op id, so one edit cannot queue twice', async () => {
    await appendPendingOp(adapter, { id: 'op-1', payload: '{}', createdAt: NOW });

    await expect(
      appendPendingOp(adapter, { id: 'op-1', payload: '{}', createdAt: NOW }),
    ).rejects.toThrow();
  });
});

describe('sync state', () => {
  let adapter: StorageAdapter;

  beforeEach(async () => {
    adapter = createNodeAdapter();
    await migrate(adapter);
  });

  it('starts from defaults and updates only the fields given', async () => {
    expect(await getSyncState(adapter)).toMatchObject({ nodeId: null, lastPulledSeq: 0 });

    await updateSyncState(adapter, { nodeId: 'device-7', lastPulledSeq: 42 });
    await updateSyncState(adapter, { lastPulledSeq: 43 });

    expect(await getSyncState(adapter)).toMatchObject({ nodeId: 'device-7', lastPulledSeq: 43 });
  });

  /** A cursor that slipped would re-apply or skip part of the server's log. */
  it('refuses a pull cursor that is fractional or negative', async () => {
    await expect(updateSyncState(adapter, { lastPulledSeq: 1.5 })).rejects.toThrow(/whole number/i);
    await expect(updateSyncState(adapter, { lastPulledSeq: -1 })).rejects.toThrow(/whole number/i);
  });

  it('says so plainly when its only row is missing, rather than reporting zero', async () => {
    await adapter.execute('DELETE FROM sync_state');

    await expect(getSyncState(adapter)).rejects.toThrow(/not been migrated|missing/i);
  });

  it('outlives the process, because a lost cursor means re-applying the log', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'gameplan-sync-'));
    const path = join(directory, 'library.db');

    const first = createNodeAdapter({ path });
    await migrate(first);
    await updateSyncState(first, { lastPulledSeq: 99 });
    await first.close();

    const second = createNodeAdapter({ path });
    expect(await getSyncState(second)).toMatchObject({ lastPulledSeq: 99 });
    await second.close();

    await rm(directory, { recursive: true, force: true });
  });
});
