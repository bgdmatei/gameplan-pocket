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

describe('pending ops', () => {
  let adapter: StorageAdapter;

  beforeEach(async () => {
    adapter = createNodeAdapter();
    await migrate(adapter);
  });

  const append = async (id: string, payload = '{}'): Promise<void> => {
    await appendPendingOp(adapter, { id, payload, createdAt: NOW });
  };

  it('returns ops in the order they were written, not by id or timestamp', async () => {
    await appendPendingOp(adapter, { id: 'z', payload: '{}', createdAt: NOW });
    await appendPendingOp(adapter, { id: 'a', payload: '{}', createdAt: '2026-01-01T00:00:00Z' });
    await appendPendingOp(adapter, { id: 'm', payload: '{}', createdAt: NOW });

    expect((await listPendingOps(adapter)).map((op) => op.id)).toEqual(['z', 'a', 'm']);
  });

  it('hands the payload back exactly as given', async () => {
    // Whatever sync-core puts in here must survive untouched: quotes,
    // backslashes, newlines, emoji, and the escape sequences JSON uses.
    const payload = JSON.stringify({
      text: 'He said "don\'t" \\ then left\nline two \u0000 escaped',
      emoji: '🎮',
      nested: { deep: [1, null, false] },
    });

    await append('op-1', payload);

    expect((await listPendingOps(adapter))[0]?.payload).toBe(payload);
  });

  it('refuses a duplicate id, so the same edit cannot be queued twice', async () => {
    await append('op-1');

    await expect(append('op-1')).rejects.toThrow();
    expect(await countPendingOps(adapter)).toBe(1);
  });

  it('respects a limit, so a push can send a batch at a time', async () => {
    for (const id of ['a', 'b', 'c', 'd']) await append(id);

    expect((await listPendingOps(adapter, { limit: 2 })).map((op) => op.id)).toEqual(['a', 'b']);
  });

  it('deletes only the acknowledged ops, leaving the rest queued in order', async () => {
    for (const id of ['a', 'b', 'c']) await append(id);

    await deletePendingOps(adapter, ['a', 'c']);

    expect((await listPendingOps(adapter)).map((op) => op.id)).toEqual(['b']);
    expect(await countPendingOps(adapter)).toBe(1);
  });

  it('ignores ids it does not have, so a repeated acknowledgement is harmless', async () => {
    await append('a');

    await deletePendingOps(adapter, ['a', 'never-existed']);

    expect(await countPendingOps(adapter)).toBe(0);
  });

  it('does nothing when asked to delete nothing', async () => {
    await append('a');

    await deletePendingOps(adapter, []);

    expect(await countPendingOps(adapter)).toBe(1);
  });

  it('counts what is still waiting, for the debug screen', async () => {
    expect(await countPendingOps(adapter)).toBe(0);

    await append('a');
    await append('b');

    expect(await countPendingOps(adapter)).toBe(2);
  });

  it('keeps insertion order after some ops are acknowledged and more arrive', async () => {
    for (const id of ['a', 'b']) await append(id);
    await deletePendingOps(adapter, ['a']);
    for (const id of ['c', 'd']) await append(id);

    expect((await listPendingOps(adapter)).map((op) => op.id)).toEqual(['b', 'c', 'd']);
  });
});

describe('sync state', () => {
  let adapter: StorageAdapter;

  beforeEach(async () => {
    adapter = createNodeAdapter();
    await migrate(adapter);
  });

  it('starts from defaults on a fresh database', async () => {
    expect(await getSyncState(adapter)).toEqual({
      nodeId: null,
      lastPulledSeq: 0,
      hlcLast: null,
      schemaVersion: 1,
      catalogVersion: 0,
    });
  });

  it('stores what it is given and reads it back', async () => {
    await updateSyncState(adapter, {
      nodeId: 'device-7',
      lastPulledSeq: 42,
      hlcLast: '00000001758196800000:0003:device-7',
      catalogVersion: 91,
    });

    expect(await getSyncState(adapter)).toEqual({
      nodeId: 'device-7',
      lastPulledSeq: 42,
      hlcLast: '00000001758196800000:0003:device-7',
      schemaVersion: 1,
      catalogVersion: 91,
    });
  });

  it('changes only the fields passed in', async () => {
    await updateSyncState(adapter, { nodeId: 'device-7', lastPulledSeq: 42 });

    await updateSyncState(adapter, { lastPulledSeq: 43 });

    expect(await getSyncState(adapter)).toMatchObject({ nodeId: 'device-7', lastPulledSeq: 43 });
  });

  it('does nothing when given no fields', async () => {
    await updateSyncState(adapter, { nodeId: 'device-7' });

    await updateSyncState(adapter, {});

    expect((await getSyncState(adapter)).nodeId).toBe('device-7');
  });

  it('keeps exactly one row however often it is written', async () => {
    await updateSyncState(adapter, { lastPulledSeq: 1 });
    await updateSyncState(adapter, { lastPulledSeq: 2 });

    expect(await adapter.execute('SELECT COUNT(*) AS count FROM sync_state')).toEqual([
      { count: 1 },
    ]);
  });

  it('treats the pull cursor as a whole number, rejecting anything else', async () => {
    await expect(updateSyncState(adapter, { lastPulledSeq: 1.5 })).rejects.toThrow(/whole number/i);
    await expect(updateSyncState(adapter, { lastPulledSeq: -1 })).rejects.toThrow(/whole number/i);
  });

  it('says so plainly when the only row is missing', async () => {
    // Corruption rather than a fresh database: the table exists, the row does
    // not, and every pull cursor is gone. Better a clear error than a silent 0,
    // which would re-apply the whole log.
    await adapter.execute('DELETE FROM sync_state');

    await expect(getSyncState(adapter)).rejects.toThrow(/not been migrated|missing/i);
  });

  it('outlives the process, because a lost cursor means re-applying the log', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'gameplan-sync-'));
    const path = join(directory, 'library.db');

    const first = createNodeAdapter({ path });
    await migrate(first);
    await updateSyncState(first, { lastPulledSeq: 99, nodeId: 'device-7' });
    await first.close();

    // A relaunch: same file, new connection.
    const second = createNodeAdapter({ path });
    expect(await getSyncState(second)).toMatchObject({ lastPulledSeq: 99, nodeId: 'device-7' });
    await second.close();

    await rm(directory, { recursive: true, force: true });
  });
});
