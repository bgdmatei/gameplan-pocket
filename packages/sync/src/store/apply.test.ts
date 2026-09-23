import {
  applyEntryChange,
  applyNoteItemChange,
  createEntry,
  createNoteItem,
} from '@gameplan/domain';
import type { LibraryEntry, NoteItem } from '@gameplan/domain';
import {
  SYNCED_ROWS,
  createMigratedNodeAdapter,
  getLibraryEntry,
  getSyncState,
  readSyncedRow,
} from '@gameplan/storage';
import type { StorageAdapter } from '@gameplan/storage';
import { describe, expect, it } from 'vitest';
import { formatHlc } from '../clock/hlc';
import { entryId } from '../ids';
import type { Op } from '../op/schema';
import { fakeEnv } from '../testing/env';
import { applyRemoteOps } from './apply';
import { commitLocalCreate, commitLocalDelete, commitLocalEdit } from './commit';

const TODAY = '2026-09-23';
const START = Date.UTC(2026, 8, 23, 10);

const stored = async (adapter: StorageAdapter) => ({
  entry: await adapter.transaction((tx) =>
    readSyncedRow(tx, SYNCED_ROWS.library_entries, entryId(1942)),
  ),
  note: await adapter.transaction((tx) => readSyncedRow(tx, SYNCED_ROWS.note_items, 'note-1')),
});

const ops = (list: readonly (Op | null)[]): Op[] => list.filter((op) => op !== null);

describe('applyRemoteOps', () => {
  it('brings two devices that edited offline to the same rows', async () => {
    const phone = await createMigratedNodeAdapter();
    const tablet = await createMigratedNodeAdapter();
    const phoneEnv = fakeEnv(START, 1);
    // The tablet's clock runs later, so its edits win where both touched a field.
    const tabletEnv = fakeEnv(START + 60_000, 2);

    // The phone adds a game and a note; the tablet pulls both.
    const entry: LibraryEntry = createEntry(
      { id: entryId(1942), gameId: 1942, status: 'playing', createdAt: '2026-09-23T10:00:00.000Z' },
      { today: TODAY },
    );
    const note: NoteItem = createNoteItem({
      id: 'note-1',
      entryId: entry.id,
      createdAt: '2026-09-23T10:00:00.000Z',
      type: 'puzzle',
      text: 'Lever',
    });
    const created = [
      await commitLocalCreate(phone, phoneEnv, { entity: 'library_entry', next: entry }),
      await commitLocalCreate(phone, phoneEnv, { entity: 'note_item', next: note }),
    ];
    await applyRemoteOps(tablet, tabletEnv, created, { lastPulledSeq: 2 });

    // Offline on both. Each status change is valid on its own device.
    phoneEnv.advance(1_000);
    const fromPhone = ops([
      await commitLocalEdit(phone, phoneEnv, {
        entity: 'library_entry',
        id: entry.id,
        update: (current) => applyEntryChange(current, { status: 'completed' }, { today: TODAY }),
      }),
      await commitLocalDelete(phone, phoneEnv, { entity: 'note_item', entityId: 'note-1' }),
    ]);

    const fromTablet = ops([
      await commitLocalEdit(tablet, tabletEnv, {
        entity: 'library_entry',
        id: entry.id,
        update: (current) =>
          applyEntryChange(current, { status: 'dropped', rating: 7 }, { today: TODAY }),
      }),
      await commitLocalEdit(tablet, tabletEnv, {
        entity: 'note_item',
        id: note.id,
        update: (current) => applyNoteItemChange(current, { text: 'Lever behind the waterfall' }),
      }),
    ]);

    // Exchange, the tablet also receiving a batch it already has.
    await applyRemoteOps(phone, phoneEnv, fromTablet, { lastPulledSeq: 6 });
    await applyRemoteOps(tablet, tabletEnv, [...fromPhone, ...created, ...fromTablet], {
      lastPulledSeq: 6,
    });

    expect(await stored(phone)).toEqual(await stored(tablet));

    // A state no single device could reach, accepted rather than rejected:
    // dropped, yet finished, because finishedOn came from the phone.
    expect(await getLibraryEntry(phone, entry.id)).toMatchObject({
      status: 'dropped',
      finishedOn: TODAY,
      rating: 7,
    });
    // The tablet's edit came after the phone's delete, so the note is back.
    expect((await stored(phone)).note).toMatchObject({
      deleted: false,
      value: { text: 'Lever behind the waterfall' },
    });
    expect((await getSyncState(phone)).lastPulledSeq).toBe(6);
  });

  it('refuses an edit for a row this device has never seen', async () => {
    const adapter = await createMigratedNodeAdapter();
    const op: Op = {
      id: '01890a5d-ac96-774b-bcce-b302099a8057',
      entity: 'library_entry',
      entityId: entryId(1942),
      type: 'set',
      fields: { rating: 5 },
      hlc: formatHlc({ wallMs: START, counter: 0, nodeId: '00000000000000aa' }),
      schemaVersion: 1,
    };

    await expect(applyRemoteOps(adapter, fakeEnv(), [op], { lastPulledSeq: 1 })).rejects.toThrow(
      /not on this device/,
    );
    expect((await getSyncState(adapter)).lastPulledSeq).toBe(0);
  });
});
