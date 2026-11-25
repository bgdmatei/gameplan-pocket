import { applyNoteItemChange, createEntry, createNoteItem } from '@gameplan/domain';
import { getNoteItem, listOpenConflicts, updateSyncState } from '@gameplan/storage';
import type { StorageAdapter } from '@gameplan/storage';
import { createMigratedNodeAdapter } from '@gameplan/storage/node';
import {
  commitLocalCreate,
  commitLocalEdit,
  entryId,
  readFieldClock,
  syncOnce,
} from '@gameplan/sync';
import type { SyncApi, SyncEnv } from '@gameplan/sync';
import { createMemoryServer } from '@gameplan/sync-server/testing';
import type { MemoryServer } from '@gameplan/sync-server/testing';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

/*
 * The module's main promise: no note text is ever lost to a merge.
 * Devices edit one note's text in editor sessions that stay open across
 * syncs, sync and resync in any order; at the end every device holds the
 * same text and the same open conflicts, and every text anyone saved is
 * either the note's text, an open conflict's, or was replaced by an edit
 * built on it. Extra conflicts are allowed (a text two steps back in a chain
 * arriving late); a lost text is not.
 *
 * Real migrated SQLite devices, the real commit path and sync loop, and the
 * in-memory server built from the API's own door and merge. Lives here for
 * the same reason as the convergence property: packages/sync can't import
 * sync-server. Proven by breaking detection: the property then fails.
 */

const START = Date.UTC(2026, 10, 24, 9);
const USER = 'user-1';
const NOTE = 'note-1';

type Device = {
  adapter: StorageAdapter;
  env: SyncEnv & { nowMs: number };
  api: SyncApi;
  /** The text clock an open editor started from, or undefined when it is closed. */
  session: string | undefined;
};

const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const deviceOf = async (server: MemoryServer, seed: number): Promise<Device> => {
  let drawn = 0;
  const env = {
    nowMs: START,
    now: () => env.nowMs,
    randomBytes: (length: number) =>
      Uint8Array.from({ length }, () => (drawn++ * 97 + 13 + seed * 7_919) % 256),
  };
  const api: SyncApi = {
    push: async (ops) => wire(server.push(USER, wire(ops))),
    pull: async (query) => wire(server.pull(USER, query)),
    snapshot: async (query) => wire(server.snapshot(USER, query)),
  };
  return { adapter: await createMigratedNodeAdapter(), env, api, session: undefined };
};

type Action =
  | { device: number; kind: 'open' }
  | { device: number; kind: 'save'; reuse: number | null }
  | { device: number; kind: 'sync' }
  | { device: number; kind: 'resync' }
  | { device: number; kind: 'wait'; ms: number };

const actionArb = (devices: number): fc.Arbitrary<Action> => {
  const device = fc.nat({ max: devices - 1 });
  return fc.oneof(
    fc.record({ device, kind: fc.constant('open' as const) }),
    {
      weight: 3,
      // Sometimes an earlier text again: two races writing the same words.
      arbitrary: fc.record({
        device,
        kind: fc.constant('save' as const),
        reuse: fc.option(fc.nat(), { freq: 4 }),
      }),
    },
    { weight: 3, arbitrary: fc.record({ device, kind: fc.constant('sync' as const) }) },
    fc.record({ device, kind: fc.constant('resync' as const) }),
    fc.record({ device, kind: fc.constant('wait' as const), ms: fc.nat({ max: 2_000 }) }),
  );
};

type Saved = { text: string; hlc: string; baseHlc: string | undefined };

const textClock = async (device: Device) =>
  (await readFieldClock(device.adapter, 'note_item', NOTE, 'text')) ?? undefined;

const run = async (device: Device, action: Action, saved: Saved[]): Promise<void> => {
  switch (action.kind) {
    case 'open':
      device.session ??= await textClock(device);
      return;
    case 'save': {
      // Save leaves the editor, so the session closes with it.
      const baseHlc = device.session ?? (await textClock(device));
      device.session = undefined;
      const again = action.reuse === null ? undefined : saved[action.reuse % saved.length];
      const text = again?.text ?? `text ${saved.length + 1}`;
      const op = await commitLocalEdit(device.adapter, device.env, {
        entity: 'note_item',
        id: NOTE,
        update: (current) => ({
          ...applyNoteItemChange(current, { text }),
          ...(baseHlc === undefined ? {} : { baseHlc }),
        }),
      });
      if (op !== null) saved.push({ text, hlc: op.hlc, baseHlc });
      return;
    }
    case 'sync':
      await syncOnce(device);
      return;
    case 'resync':
      await updateSyncState(device.adapter, { resync: true });
      await syncOnce(device);
      return;
    case 'wait':
      device.env.nowMs += action.ms;
      return;
  }
};

const openConflicts = async (device: Device) =>
  (await listOpenConflicts(device.adapter, NOTE)).map(({ id, text }) => ({ id, text }));

describe('note conflicts through the server', () => {
  it('loses no note text, and brings every device to the same text and conflicts', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .integer({ min: 2, max: 4 })
          .chain((count) =>
            fc.tuple(fc.constant(count), fc.array(actionArb(count), { maxLength: 40 })),
          ),
        async ([count, actions]) => {
          const devices: Device[] = [];
          const server = createMemoryServer({
            now: () => Math.max(...devices.map((d) => d.env.nowMs)),
          });
          for (let seed = 1; seed <= count; seed += 1) devices.push(await deviceOf(server, seed));

          // The first device writes the game and its note; everyone pulls them.
          const [first] = devices;
          if (first === undefined) throw new Error('No devices.');
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
            text: 'text 0',
          });
          await commitLocalCreate(first.adapter, first.env, {
            entity: 'library_entry',
            next: entry,
          });
          const created = await commitLocalCreate(first.adapter, first.env, {
            entity: 'note_item',
            next: note,
          });
          const saved: Saved[] = [{ text: 'text 0', hlc: created.hlc, baseHlc: undefined }];
          for (const device of devices) await syncOnce(device);

          for (const action of actions) {
            const device = devices[action.device];
            if (device !== undefined) await run(device, action, saved);
          }
          // Conflicts found in one round are pushed in the next.
          for (let round = 0; round < 3; round += 1) {
            for (const device of devices) await syncOnce(device);
          }

          const [expected, ...others] = await Promise.all(
            devices.map(async (device) => ({
              text: (await getNoteItem(device.adapter, NOTE))?.text,
              conflicts: await openConflicts(device),
            })),
          );
          for (const other of others) expect(other).toEqual(expected);

          const kept = new Set([expected?.text, ...(expected?.conflicts ?? []).map((c) => c.text)]);
          // Judged by the words: two races may have written the same text.
          const builtOn = new Set(saved.flatMap(({ baseHlc }) => baseHlc ?? []));
          const replaced = new Set(saved.filter(({ hlc }) => builtOn.has(hlc)).map((s) => s.text));
          const lost = saved.filter(({ text }) => !kept.has(text) && !replaced.has(text));
          expect(lost).toEqual([]);

          for (const device of devices) await device.adapter.close();
        },
      ),
      { numRuns: 60 },
    );
  });
});
