import { webcrypto } from 'node:crypto';
import type { Game } from '@gameplan/domain';
import { countPendingOps, listLibraryGrid, listNowPlaying, upsertGames } from '@gameplan/storage';
import { createMigratedNodeAdapter } from '@gameplan/storage/node';
import { entryId } from '@gameplan/sync';
import type { SyncEnv } from '@gameplan/sync';
import { describe, expect, it } from 'vitest';
import { addGame } from './add-game';
import { setStatusFromShelf } from './now-playing';

const env: SyncEnv = {
  now: () => Date.UTC(2026, 9, 2, 18),
  randomBytes: (length) => webcrypto.getRandomValues(new Uint8Array(length)),
};

const game = (id: number): Game => ({
  id,
  name: `Game ${String(id)}`,
  slug: `game-${String(id)}`,
  summary: null,
  firstReleaseDate: null,
  coverImageId: null,
  genreIds: [],
  platformIds: [],
});

describe('Now Playing', () => {
  // Every game being played lives on the shelf, most recently started first;
  // taking one off the shelf by status moves it to that status's grid, as one op.
  it('holds every Playing game, newest start first, and hands one to a grid', async () => {
    const adapter = await createMigratedNodeAdapter();
    await upsertGames(adapter, {
      games: [1, 2, 3, 4].map(game),
      fetchedAt: '2026-10-02T18:00:00Z',
    });
    await addGame(adapter, env, { gameId: 1, status: 'playing', today: '2026-09-01' });
    await addGame(adapter, env, { gameId: 2, status: 'playing', today: '2026-09-20' });
    await addGame(adapter, env, { gameId: 3, status: 'backlog', today: '2026-09-25' });
    await addGame(adapter, env, { gameId: 4, status: 'playing', today: '2026-09-10' });

    const shelf = async () => (await listNowPlaying(adapter)).map((row) => row.gameId);
    const paused = async () =>
      (await listLibraryGrid(adapter, { status: 'paused', limit: 50 })).rows.map(
        (row) => row.gameId,
      );
    expect(await shelf()).toEqual([2, 4, 1]);
    expect(await paused()).toEqual([]);

    const opsBefore = await countPendingOps(adapter);
    await setStatusFromShelf(adapter, env, {
      entryId: entryId(2),
      status: 'paused',
      today: '2026-10-02',
    });
    expect(await countPendingOps(adapter)).toBe(opsBefore + 1);
    expect(await shelf()).toEqual([4, 1]);
    expect(await paused()).toEqual([2]);
  });
});
