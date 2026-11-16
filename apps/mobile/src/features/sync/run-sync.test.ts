import { createEntry } from '@gameplan/domain';
import type { Game } from '@gameplan/domain';
import { getGame, listLibraryGrid, listPendingOps } from '@gameplan/storage';
import { createMigratedNodeAdapter } from '@gameplan/storage/node';
import { commitLocalCreate, entryId } from '@gameplan/sync';
import type { SyncApi } from '@gameplan/sync';
import { describe, expect, it } from 'vitest';
import { testEnv } from '../account/test-fixtures';
import { runSync } from './run-sync';
import type { GameSource } from './run-sync';

const gameOf = (id: number): Game => ({
  id,
  name: `Game ${String(id)}`,
  slug: `game-${String(id)}`,
  summary: null,
  firstReleaseDate: null,
  coverImageId: null,
  genreIds: [12],
  platformIds: [6],
});

/** The ops another device would push: one library entry per game. */
const entriesFromElsewhere = async (gameIds: readonly number[]) => {
  const other = await createMigratedNodeAdapter();
  for (const gameId of gameIds) {
    const next = createEntry(
      { id: entryId(gameId), gameId, status: 'backlog', createdAt: '2026-10-14T11:00:00.000Z' },
      { today: '2026-10-14' },
    );
    await commitLocalCreate(other, testEnv, { entity: 'library_entry', next });
  }
  const ops = (await listPendingOps(other)).map((op): unknown => JSON.parse(op.payload));
  await other.close();
  return ops;
};

describe('runSync', () => {
  // An entry pulled from another device stays hidden until its game is
  // cached; a catalog call per game would be 120 requests here, not 2.
  it('caches the games a pull brought, a batch per catalog call', async () => {
    const adapter = await createMigratedNodeAdapter();
    const ids = Array.from({ length: 120 }, (_, i) => 1000 + i);
    const ops = await entriesFromElsewhere(ids);
    const api: SyncApi = {
      push: async () => ({ accepted: [], rejected: [], lastSeq: 0 }),
      snapshot: async () => ({ rows: [], seq: 0, nextCursor: null }),
      pull: async ({ after }) =>
        after === 0
          ? { ops: ops.map((op, i) => ({ seq: i + 1, op })), lastSeq: ops.length, hasMore: false }
          : { ops: [], lastSeq: after, hasMore: false },
    };
    const requested: number[][] = [];
    const catalog: GameSource = {
      getGames: async (batch) => {
        requested.push([...batch]);
        // Review of #20: the server doesn't know one id, and answers with one
        // never asked for. Neither may be asked for again, or the loop spins.
        const known = batch.filter((id) => id !== 1005);
        return { kind: 'ok', stale: false, value: [...known, 9999].map(gameOf) };
      },
      getReference: async () => ({
        kind: 'ok',
        stale: false,
        value: {
          genres: [{ id: 12, name: 'Role-playing (RPG)', slug: 'role-playing-rpg' }],
          platforms: [{ id: 6, name: 'PC (Microsoft Windows)', abbreviation: 'PC' }],
        },
      }),
    };

    const result = await runSync({ adapter, env: testEnv, api, catalog });

    expect(result).toMatchObject({ pulled: 120, games: 119 });
    expect(requested.map((batch) => batch.length)).toEqual([100, 20]);
    const grid = await listLibraryGrid(adapter, { limit: 200 });
    expect(grid.rows).toHaveLength(119);
    expect(await getGame(adapter, 9999)).toBeNull();
    await adapter.close();
  });
});
