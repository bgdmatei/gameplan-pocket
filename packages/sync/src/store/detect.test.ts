import { applyNoteItemChange, createEntry, createNoteItem } from '@gameplan/domain';
import {
  SYNCED_ROWS,
  listOpenConflicts,
  listPendingOps,
  readSyncedRow,
  updateSyncState,
} from '@gameplan/storage';
import type { StorageAdapter } from '@gameplan/storage';
import { createMigratedNodeAdapter } from '@gameplan/storage/node';
import { describe, expect, it } from 'vitest';
import { entryId } from '../ids';
import type { Op } from '../op/schema';
import { fakeEnv } from '../testing/env';
import { syncOnce } from '../transport/sync-once';
import type { SyncApi } from '../transport/sync-once';
import type { FakeEnv } from '../testing/env';
import { applyRemoteOps, applySnapshot } from './apply';
import { commitLocalCreate, commitLocalEdit } from './commit';
import { readFieldClock } from './read';

const START = Date.UTC(2026, 10, 24, 10);
const NOTE = 'note-1';

type Device = { adapter: StorageAdapter; env: FakeEnv; seq: number };

const deviceOf = async (seed: number): Promise<Device> => ({
  adapter: await createMigratedNodeAdapter(),
  env: fakeEnv(START, seed),
  seq: 0,
});

/** A phone holding a game and its note, and a tablet that pulled both. */
const twoDevices = async () => {
  const phone = await deviceOf(1);
  const tablet = await deviceOf(2);
  const at = new Date(START).toISOString();
  const entry = createEntry(
    { id: entryId(1942), gameId: 1942, status: 'playing', createdAt: at },
    { today: at.slice(0, 10) },
  );
  const note = createNoteItem({
    id: NOTE,
    entryId: entry.id,
    createdAt: at,
    type: 'puzzle',
    text: 'Lever',
  });
  const created = [
    await commitLocalCreate(phone.adapter, phone.env, { entity: 'library_entry', next: entry }),
    await commitLocalCreate(phone.adapter, phone.env, { entity: 'note_item', next: note }),
  ];
  await pull(tablet, created);
  return { phone, tablet };
};

const pull = async (device: Device, ops: readonly Op[]) => {
  device.seq += 1;
  await applyRemoteOps(device.adapter, device.env, ops, { lastPulledSeq: device.seq });
};

/** The clock of the text as the device holds it: what an editor opening now starts from. */
const open = async (device: Device) =>
  (await readFieldClock(device.adapter, 'note_item', NOTE, 'text')) ?? undefined;

const save = async (device: Device, text: string, baseHlc: string | undefined, afterMs: number) => {
  device.env.advance(afterMs);
  const op = await commitLocalEdit(device.adapter, device.env, {
    entity: 'note_item',
    id: NOTE,
    update: (current) => ({
      ...applyNoteItemChange(current, { text }),
      ...(baseHlc === undefined ? {} : { baseHlc }),
    }),
  });
  if (op === null) throw new Error('The save changed nothing.');
  return op;
};

/** The conflict ops a device queued, as its next push would send them. */
const queuedConflicts = async (device: Device): Promise<Op[]> =>
  (await listPendingOps(device.adapter))
    .map(({ payload }) => JSON.parse(payload) as Op)
    .filter((op) => op.entity === 'note_conflict');

const openTexts = async (device: Device) =>
  (await listOpenConflicts(device.adapter, NOTE)).map(({ text }) => text);

describe('conflicts found on pull', () => {
  // Proven by giving each conflict a random id: each device then holds two.
  it('keeps the losing text as one conflict, however many devices spot the race', async () => {
    const { phone, tablet } = await twoDevices();
    const base = await open(phone);
    const fromPhone = await save(phone, 'Lever, left one', base, 1_000);
    const fromTablet = await save(tablet, 'Lever, right one', base, 2_000);

    await pull(phone, [fromTablet]);
    await pull(tablet, [fromPhone]);
    await pull(phone, await queuedConflicts(tablet));
    await pull(tablet, await queuedConflicts(phone));

    expect(await openTexts(phone)).toEqual(['Lever, left one']);
    expect(await listOpenConflicts(tablet.adapter, NOTE)).toEqual(
      await listOpenConflicts(phone.adapter, NOTE),
    );
  });

  // The tablet spots the race only after the phone resolved it. Proven by
  // queuing the conflict at a fresh clock: the late copy then wins.
  it('never reopens a resolved conflict when a late copy arrives', async () => {
    const { phone, tablet } = await twoDevices();
    const base = await open(phone);
    const fromPhone = await save(phone, 'Lever, left one', base, 1_000);
    const fromTablet = await save(tablet, 'Lever, right one', base, 2_000);
    await pull(phone, [fromTablet]);

    const [conflict] = await listOpenConflicts(phone.adapter, NOTE);
    if (conflict === undefined) throw new Error('No conflict to resolve.');
    phone.env.advance(1_000);
    await commitLocalEdit(phone.adapter, phone.env, {
      entity: 'note_conflict',
      id: conflict.id,
      update: (current) => ({ next: { ...current, resolved: true }, changed: { resolved: true } }),
    });
    tablet.env.advance(60_000);
    await pull(tablet, [fromPhone]);
    await pull(phone, await queuedConflicts(tablet));

    expect(await openTexts(phone)).toEqual([]);
  });

  // Review of #60: a device's first save, pulled back after later ones,
  // matches neither base, and passed for a race with its own later text.
  it("never raises one for a device's own saves coming back", async () => {
    const { phone } = await twoDevices();
    const saves: Op[] = [];
    for (const text of ['Lever', 'Lever, left', 'Lever, left one']) {
      saves.push(await save(phone, `${text}!`, await open(phone), 1_000));
    }

    // Over separate pulls: in one, only the last of a device's edits is checked.
    for (const op of saves) await pull(phone, [op]);

    expect(await queuedConflicts(phone)).toEqual([]);
  });

  // The tablet's first edit lost to the phone's text, then the tablet
  // replaced it with an edit built on it: no conflict for it. Proven by
  // ignoring what the pull's other edits were built on.
  it('keeps no conflict for a text another edit in the same pull was built on', async () => {
    const { phone, tablet } = await twoDevices();
    const base = await open(phone);
    const first = await save(tablet, 'Lever, right', base, 1_000);
    const fromPhone = await save(phone, 'Lever, left one', base, 2_000);
    const second = await save(tablet, 'Lever, right one', await open(tablet), 2_000);

    await pull(phone, [first, second]);

    expect(await openTexts(phone)).toEqual(['Lever, left one']);
    expect(fromPhone.hlc > first.hlc).toBe(true);
  });

  // ADR-009: an open editor counts as offline. The tablet's editor opened
  // before the phone's edit and saved after pulling it; the phone, holding
  // the text the save replaced, raises the conflict, and sync carries it back.
  it('turns a save over a text pulled while the editor was open into a conflict', async () => {
    const { phone, tablet } = await twoDevices();
    const editorOpened = await open(tablet);
    const fromPhone = await save(phone, 'Lever, left one', await open(phone), 1_000);
    await pull(tablet, [fromPhone]);
    const fromTablet = await save(tablet, 'Lever, right one', editorOpened, 2_000);

    await pull(phone, [fromTablet]);
    expect(await openTexts(phone)).toEqual(['Lever, left one']);

    await pull(tablet, await queuedConflicts(phone));
    expect(await openTexts(tablet)).toEqual(['Lever, left one']);
  });

  // Review of #60: a snapshot carries only the end of the tablet's chain
  // (built on its own earlier edit), whose base is newer than the phone's
  // racing text. Clock order waved this through. Proven by skipping snapshots.
  it('finds a race against the end of a chain that arrives by snapshot', async () => {
    const { phone, tablet } = await twoDevices();
    const fromPhone = await save(phone, 'Lever, left one', await open(phone), 1_000);
    await save(tablet, 'Lever, right', await open(tablet), 2_000);
    await save(tablet, 'Lever, right one', await open(tablet), 1_000);
    const row = await tablet.adapter.transaction((tx) =>
      readSyncedRow(tx, SYNCED_ROWS.note_items, NOTE),
    );
    if (row === null) throw new Error('The tablet lost its note.');
    const { id, ...fields } = row.value;

    await applySnapshot(
      phone.adapter,
      phone.env,
      [
        {
          entity: 'note_item',
          id,
          fields,
          fieldHlc: JSON.parse(row.fieldHlc) as Record<string, string>,
          deleted: false,
        },
      ],
      { seq: 3 },
    );

    expect(await openTexts(phone)).toEqual(['Lever, left one']);
    expect(fromPhone.hlc < JSON.parse(row.fieldHlc).text).toBe(true);
  });

  // Review of #63: checking only a device's last edit in a pull let its
  // earlier one replace the held text first, so the last looked built on it
  // and the phone's own text vanished with no conflict on the phone.
  it("keeps this device's text when another device's chain overtakes it in one pull", async () => {
    const { phone, tablet } = await twoDevices();
    const base = await open(phone);
    const fromPhone = await save(phone, 'Lever, left one', base, 1_000);
    const first = await save(tablet, 'Lever, right', base, 2_000);
    const second = await save(tablet, 'Lever, right one', await open(tablet), 1_000);

    await pull(phone, [first, second, fromPhone]);

    expect(await openTexts(phone)).toEqual(['Lever, left one']);
  });

  // Proven by dropping the push after the pull: the conflict then waits for
  // the next sync, which a sign-out (destroying the database) can pre-empt.
  it('sends a conflict found on a pull in the same sync', async () => {
    const { phone, tablet } = await twoDevices();
    const base = await open(phone);
    await save(phone, 'Lever, left one', base, 1_000);
    const fromTablet = await save(tablet, 'Lever, right one', base, 2_000);
    const sent: unknown[] = [];
    const api: SyncApi = {
      push: async (ops) => {
        sent.push(...ops);
        return { accepted: ops.map((op) => (op as Op).id), rejected: [], lastSeq: 0 };
      },
      snapshot: async () => ({ rows: [], seq: 0, nextCursor: null }),
      pull: async ({ after }) =>
        after === 0
          ? { ops: [{ seq: 1, op: fromTablet }], lastSeq: 1, hasMore: false }
          : { ops: [], lastSeq: after, hasMore: false },
    };
    await updateSyncState(phone.adapter, { bootstrapped: true });

    await syncOnce({ adapter: phone.adapter, env: phone.env, api });

    expect(sent.filter((op) => (op as Op).entity === 'note_conflict')).toHaveLength(1);
    expect(await listPendingOps(phone.adapter)).toEqual([]);
  });

  // Second review of #63: the outbox was measured after the snapshot, so a
  // conflict the snapshot found waited for the next sync.
  it('sends a conflict found in a snapshot in the same sync', async () => {
    const { phone, tablet } = await twoDevices();
    const base = await open(phone);
    await save(phone, 'Lever, left one', base, 1_000);
    await save(tablet, 'Lever, right one', base, 2_000);
    const row = await tablet.adapter.transaction((tx) =>
      readSyncedRow(tx, SYNCED_ROWS.note_items, NOTE),
    );
    if (row === null) throw new Error('The tablet lost its note.');
    const { id, ...fields } = row.value;
    const sent: unknown[] = [];
    const api: SyncApi = {
      push: async (ops) => {
        sent.push(...ops);
        return { accepted: ops.map((op) => (op as Op).id), rejected: [], lastSeq: 0 };
      },
      snapshot: async () => ({
        rows: [
          {
            entity: 'note_item',
            id,
            fields,
            fieldHlc: JSON.parse(row.fieldHlc) as Record<string, string>,
            deleted: false,
          },
        ],
        seq: 1,
        nextCursor: null,
      }),
      pull: async ({ after }) => ({ ops: [], lastSeq: after, hasMore: false }),
    };

    await syncOnce({ adapter: phone.adapter, env: phone.env, api });

    expect(sent.filter((op) => (op as Op).entity === 'note_conflict')).toHaveLength(1);
  });
});
