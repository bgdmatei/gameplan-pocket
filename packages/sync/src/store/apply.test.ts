import {
  applyEntryChange,
  applyNoteItemChange,
  createEntry,
  createNoteItem,
} from '@gameplan/domain';
import type { LibraryEntry, NoteItem } from '@gameplan/domain';
import { SYNCED_ROWS, getLibraryEntry, getSyncState, readSyncedRow } from '@gameplan/storage';
import { createMigratedNodeAdapter } from '@gameplan/storage/node';
import type { StorageAdapter } from '@gameplan/storage';
import { describe, expect, it } from 'vitest';
import { formatHlc, parseHlc } from '../clock/hlc';
import { conflictFromLosingEdit } from '../conflicts/conflicts';
import { BASE_TEXT_CLOCK } from '../merge/merge';
import { entryId } from '../ids';
import type { Op } from '../op/schema';
import { fakeEnv } from '../testing/env';
import { applyRemoteOps, applySnapshot } from './apply';
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

  // #26: this used to throw (SPEC-sync-core.md decision 8), which stopped
  // every later sync on the device. The row is skipped; the position moves on.
  it('skips an edit for a row this device has never seen', async () => {
    const adapter = await createMigratedNodeAdapter();
    const op: Op = {
      id: '01890a5d-ac96-774b-bcce-b302099a8057',
      entity: 'library_entry',
      entityId: entryId(1942),
      type: 'set',
      fields: { rating: 5 },
      hlc: formatHlc({ wallMs: START, counter: 0, nodeId: '00000000000000aa' }),
      schemaVersion: 2,
    };

    expect(await applyRemoteOps(adapter, fakeEnv(), [op], { lastPulledSeq: 1 })).toEqual({
      applied: 0,
      skipped: 1,
    });
    expect((await stored(adapter)).entry).toBeNull();
    expect((await getSyncState(adapter)).lastPulledSeq).toBe(1);
  });

  it('stores a note conflict pulled from another device', async () => {
    const adapter = await createMigratedNodeAdapter();
    const hlc = formatHlc({ wallMs: START, counter: 0, nodeId: '00000000000000aa' });
    const { id, ...fields } = conflictFromLosingEdit('note-1', { text: 'Lever', hlc });
    const op: Op = {
      id: '01890a5d-ac96-774b-bcce-b302099a8057',
      entity: 'note_conflict',
      entityId: id,
      type: 'set',
      fields,
      hlc,
      schemaVersion: 2,
    };

    await applyRemoteOps(adapter, fakeEnv(), [op], { lastPulledSeq: 1 });

    const row = await adapter.transaction((tx) =>
      readSyncedRow(tx, SYNCED_ROWS.note_conflicts, id),
    );
    expect(row?.value).toEqual({ id, ...fields });
  });

  // A base is no edit's clock, and a reserved key from a newer server may not
  // be a clock at all: neither may move this device's clock.
  it('learns only edit clocks from a snapshot row', async () => {
    const adapter = await createMigratedNodeAdapter();
    const env = fakeEnv(START);
    const at = (wallMs: number) => formatHlc({ wallMs, counter: 0, nodeId: '00000000000000aa' });
    const note = createNoteItem({
      id: 'note-1',
      entryId: entryId(1942),
      createdAt: '2026-09-23T10:00:00.000Z',
      type: 'puzzle',
      text: 'Lever',
    });
    const { id, ...fields } = note;
    const clocks = Object.fromEntries(Object.keys(fields).map((field) => [field, at(START)]));
    const later = at(START + 3_600_000);

    await applySnapshot(
      adapter,
      env,
      [
        {
          entity: 'note_item',
          id,
          fields,
          fieldHlc: { ...clocks, [BASE_TEXT_CLOCK]: later, $future: later },
          deleted: false,
        },
      ],
      { seq: 1 },
    );

    const { hlcLast } = await getSyncState(adapter);
    expect(hlcLast === null ? null : parseHlc(hlcLast).wallMs).toBe(START);
  });
});
