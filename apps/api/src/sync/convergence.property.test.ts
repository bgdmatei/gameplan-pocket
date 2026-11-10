import { createEntry, createList } from '@gameplan/domain';
import { SYNCED_ROWS, readSyncedRow } from '@gameplan/storage';
import type { StorageAdapter, StoredRow } from '@gameplan/storage';
import { createMigratedNodeAdapter } from '@gameplan/storage/node';
import {
  commitLocalCreate,
  commitLocalDelete,
  commitLocalEdit,
  entryId,
  syncOnce,
} from '@gameplan/sync';
import type { SyncApi, SyncEnv } from '@gameplan/sync';
import { createMemoryServer } from '@gameplan/sync-server/testing';
import type { MemoryServer } from '@gameplan/sync-server/testing';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

/*
 * The module's main promise (SPEC-sync-transport.md): devices that edit
 * offline and sync in any order end up equal to each other and to the server.
 * Each device is a real migrated SQLite database making edits through the
 * real commit path and syncing with the real loop; the server is the
 * in-memory one built from the API's own door and merge (@gameplan/sync-server).
 *
 * Lives in apps/api because it needs both the client loop and the server's
 * core, and packages/sync can't import sync-server (owner, 2026-11-10).
 * Proven by breaking the server's merge: the property then fails.
 */

const START = Date.UTC(2026, 10, 10, 9);
const USER = 'user-1';
const LIST_IDS = ['l-1', 'l-2'] as const;
const GAMES = [1942, 7346] as const;

type Device = { adapter: StorageAdapter; env: SyncEnv & { nowMs: number }; api: SyncApi };

/** JSON in and out, as over HTTP: nothing passes by reference. */
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
  return { adapter: await createMigratedNodeAdapter(), env, api };
};

type Action =
  | { device: number; kind: 'sync' }
  | { device: number; kind: 'wait'; ms: number }
  | { device: number; kind: 'createList'; list: number; name: string }
  | { device: number; kind: 'renameList'; list: number; name: string }
  | { device: number; kind: 'deleteList'; list: number }
  | { device: number; kind: 'createEntry'; game: number; status: 'playing' | 'backlog' }
  | { device: number; kind: 'favourite'; game: number; value: boolean };

/*
 * Tiny pools, so devices keep editing the same field of the same row: a
 * generator that rarely collides proves nothing.
 */
const actionArb = (devices: number): fc.Arbitrary<Action> => {
  const device = fc.nat({ max: devices - 1 });
  const list = fc.nat({ max: LIST_IDS.length - 1 });
  const game = fc.nat({ max: GAMES.length - 1 });
  const name = fc.constantFrom('Co-op', 'RPG', 'Later');
  return fc.oneof(
    fc.record({ device, kind: fc.constant('sync' as const) }),
    fc.record({ device, kind: fc.constant('wait' as const), ms: fc.nat({ max: 2_000 }) }),
    fc.record({ device, kind: fc.constant('createList' as const), list, name }),
    fc.record({ device, kind: fc.constant('renameList' as const), list, name }),
    fc.record({ device, kind: fc.constant('deleteList' as const), list }),
    fc.record({
      device,
      kind: fc.constant('createEntry' as const),
      game,
      status: fc.constantFrom('playing' as const, 'backlog' as const),
    }),
    fc.record({ device, kind: fc.constant('favourite' as const), game, value: fc.boolean() }),
  );
};

type Table = 'lists' | 'library_entries';

const read = (
  device: Device,
  table: Table,
  id: string,
): Promise<StoredRow<{ id: string }> | null> =>
  device.adapter.transaction(async (tx) =>
    table === 'lists'
      ? await readSyncedRow(tx, SYNCED_ROWS.lists, id)
      : await readSyncedRow(tx, SYNCED_ROWS.library_entries, id),
  );

const exists = async (device: Device, table: Table, id: string) =>
  (await read(device, table, id)) !== null;

const run = async (device: Device, action: Action): Promise<void> => {
  const { adapter, env } = device;
  const at = new Date(env.nowMs).toISOString();
  switch (action.kind) {
    case 'sync':
      await syncOnce(device);
      return;
    case 'wait':
      env.nowMs += action.ms;
      return;
    case 'createList': {
      const id = LIST_IDS[action.list] ?? 'l-1';
      if (await exists(device, 'lists', id)) return;
      const next = createList({ id, name: action.name, createdAt: at });
      await commitLocalCreate(adapter, env, { entity: 'list', next });
      return;
    }
    case 'renameList': {
      const id = LIST_IDS[action.list] ?? 'l-1';
      if (!(await exists(device, 'lists', id))) return;
      await commitLocalEdit(adapter, env, {
        entity: 'list',
        id,
        update: (current) => ({
          next: { ...current, name: action.name },
          changed: { name: action.name },
        }),
      });
      return;
    }
    case 'deleteList': {
      const id = LIST_IDS[action.list] ?? 'l-1';
      if (!(await exists(device, 'lists', id))) return;
      await commitLocalDelete(adapter, env, { entity: 'list', entityId: id });
      return;
    }
    case 'createEntry': {
      const gameId = GAMES[action.game] ?? 1942;
      if (await exists(device, 'library_entries', entryId(gameId))) return;
      const next = createEntry(
        { id: entryId(gameId), gameId, status: action.status, createdAt: at },
        { today: at.slice(0, 10) },
      );
      await commitLocalCreate(adapter, env, { entity: 'library_entry', next });
      return;
    }
    case 'favourite': {
      const id = entryId(GAMES[action.game] ?? 1942);
      if (!(await exists(device, 'library_entries', id))) return;
      await commitLocalEdit(adapter, env, {
        entity: 'library_entry',
        id,
        update: (current) => ({
          next: { ...current, favourite: action.value },
          changed: { favourite: action.value },
        }),
      });
      return;
    }
  }
};

/** Every row a device holds, in the server snapshot's shape. */
const rowsOnDevice = async (device: Device) => {
  const rows = [];
  for (const [entity, table, ids] of [
    ['list', 'lists', LIST_IDS],
    ['library_entry', 'library_entries', GAMES.map(entryId)],
  ] as const) {
    for (const id of ids) {
      const stored = await read(device, table, id);
      if (stored === null) continue;
      const fields: Record<string, unknown> = { ...stored.value };
      delete fields['id'];
      rows.push({
        entity,
        id,
        fields,
        fieldHlc: JSON.parse(stored.fieldHlc) as Record<string, string>,
        deleted: stored.deleted,
      });
    }
  }
  return rows.sort((a, b) => `${a.entity}:${a.id}`.localeCompare(`${b.entity}:${b.id}`));
};

const rowsOnServer = (server: MemoryServer) => {
  const rows = [];
  let page = server.snapshot(USER, {});
  rows.push(...page.rows);
  while (page.nextCursor !== null) {
    page = server.snapshot(USER, { cursor: page.nextCursor });
    rows.push(...page.rows);
  }
  return wire(rows).sort((a, b) => `${a.entity}:${a.id}`.localeCompare(`${b.entity}:${b.id}`));
};

describe('sync through the server', () => {
  it('brings every device and the server to the same rows', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .integer({ min: 2, max: 4 })
          .chain((count) =>
            fc.tuple(fc.constant(count), fc.array(actionArb(count), { maxLength: 40 })),
          ),
        async ([count, actions]) => {
          // The server's clock is the latest of the devices', so no device is
          // ever too far ahead of it.
          const devices: Device[] = [];
          const server = createMemoryServer({
            now: () => Math.max(...devices.map((d) => d.env.nowMs)),
          });
          for (let seed = 1; seed <= count; seed += 1) devices.push(await deviceOf(server, seed));

          for (const action of actions) {
            const device = devices[action.device];
            if (device !== undefined) await run(device, action);
          }
          // Everyone syncs, twice: the second round brings each device the
          // edits pushed by those that synced after it in the first.
          for (let round = 0; round < 2; round += 1) {
            for (const device of devices) await syncOnce(device);
          }

          const expected = rowsOnServer(server);
          for (const device of devices) {
            expect(await rowsOnDevice(device)).toEqual(expected);
            await device.adapter.close();
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});
