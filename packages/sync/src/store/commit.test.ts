import { DomainValidationError, applyEntryChange, createEntry } from '@gameplan/domain';
import { countPendingOps, getLibraryEntry, getSyncState, listPendingOps } from '@gameplan/storage';
import { createMigratedNodeAdapter } from '@gameplan/storage/node';
import { describe, expect, it } from 'vitest';
import { entryId } from '../ids';
import { fakeEnv } from '../testing/env';
import { applyRemoteOps } from './apply';
import { commitLocalCreate, commitLocalEdit } from './commit';

const TODAY = '2026-09-23';

const entry = createEntry(
  { id: entryId(1942), gameId: 1942, status: 'playing', createdAt: '2026-09-23T10:00:00.000Z' },
  { today: TODAY },
);

describe('commitLocalEdit', () => {
  it('writes nothing for an edit that changed nothing', async () => {
    const adapter = await createMigratedNodeAdapter();
    const env = fakeEnv();
    const created = await commitLocalCreate(adapter, env, { entity: 'library_entry', next: entry });

    const op = await commitLocalEdit(adapter, env, {
      entity: 'library_entry',
      id: entry.id,
      update: (current) => applyEntryChange(current, { rating: current.rating }, { today: TODAY }),
    });

    expect(op).toBeNull();
    expect(await countPendingOps(adapter)).toBe(1);
    expect((await getSyncState(adapter)).hlcLast).toBe(created.hlc);
  });

  /**
   * The bug this function exists to prevent: a screen read the entry, a pull
   * then changed it, and saving the screen's copy wrote the old value back
   * under a new clock, so every device lost the pulled change.
   */
  it('edits the row as it is now, not as a screen last saw it', async () => {
    const phone = await createMigratedNodeAdapter();
    const tablet = await createMigratedNodeAdapter();
    const phoneEnv = fakeEnv(Date.UTC(2026, 8, 23, 10), 1);
    const tabletEnv = fakeEnv(Date.UTC(2026, 8, 23, 10), 2);

    const created = await commitLocalCreate(phone, phoneEnv, {
      entity: 'library_entry',
      next: entry,
    });
    await applyRemoteOps(tablet, tabletEnv, [created], { lastPulledSeq: 1 });

    const onScreen = await getLibraryEntry(phone, entry.id);
    tabletEnv.advance(1_000);
    const rated = await commitLocalEdit(tablet, tabletEnv, {
      entity: 'library_entry',
      id: entry.id,
      update: (current) => applyEntryChange(current, { rating: 8 }, { today: TODAY }),
    });
    await applyRemoteOps(phone, phoneEnv, rated === null ? [] : [rated], { lastPulledSeq: 2 });

    phoneEnv.advance(2_000);
    await commitLocalEdit(phone, phoneEnv, {
      entity: 'library_entry',
      id: entry.id,
      update: (current) => applyEntryChange(current, { favourite: true }, { today: TODAY }),
    });

    expect(onScreen?.rating).toBeNull();
    expect(await getLibraryEntry(phone, entry.id)).toMatchObject({ rating: 8, favourite: true });
  });

  it('writes nothing when the domain rule rejects the edit', async () => {
    const adapter = await createMigratedNodeAdapter();
    const env = fakeEnv();
    const created = await commitLocalCreate(adapter, env, { entity: 'library_entry', next: entry });

    await expect(
      commitLocalEdit(adapter, env, {
        entity: 'library_entry',
        id: entry.id,
        update: (current) => applyEntryChange(current, { status: 'wishlist' }, { today: TODAY }),
      }),
    ).rejects.toThrow(DomainValidationError);

    expect(await getLibraryEntry(adapter, entry.id)).toEqual(entry);
    expect(await countPendingOps(adapter)).toBe(1);
    expect((await getSyncState(adapter)).hlcLast).toBe(created.hlc);
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
      commitLocalEdit(adapter, env, {
        entity: 'library_entry',
        id: entry.id,
        update: (current) => applyEntryChange(current, { rating: 9 }, { today: TODAY }),
      }),
    ).rejects.toThrow();

    expect(await getLibraryEntry(adapter, entry.id)).toEqual(entry);
    expect(await countPendingOps(adapter)).toBe(1);
    expect((await getSyncState(adapter)).hlcLast).toBe(op.hlc);
  });
});
