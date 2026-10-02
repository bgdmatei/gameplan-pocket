import { webcrypto } from 'node:crypto';
import { DomainValidationError } from '@gameplan/domain';
import type { Game } from '@gameplan/domain';
import { countPendingOps, listShelf, upsertGames } from '@gameplan/storage';
import { createMigratedNodeAdapter } from '@gameplan/storage/node';
import { entryId } from '@gameplan/sync';
import type { SyncEnv } from '@gameplan/sync';
import { describe, expect, it } from 'vitest';
import { addGame } from './add-game';
import { shelveGame, unshelveGame } from './shelf';

const TODAY = '2026-10-01';
const env: SyncEnv = {
  now: () => Date.UTC(2026, 9, 1, 18),
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

describe('the Now Playing shelf', () => {
  // The shelf shows five games: a sixth is refused with a reason the toast
  // can show, and nothing is written.
  it('takes five games being played and refuses a sixth', async () => {
    const adapter = await createMigratedNodeAdapter();
    const ids = [1, 2, 3, 4, 5, 6];
    await upsertGames(adapter, { games: ids.map(game), fetchedAt: '2026-10-01T18:00:00Z' });
    for (const id of ids) {
      await addGame(adapter, env, { gameId: id, status: 'playing', today: TODAY });
      if (id <= 5) await shelveGame(adapter, env, { entryId: entryId(id), today: TODAY });
    }
    const opsBefore = await countPendingOps(adapter);

    await expect(
      shelveGame(adapter, env, { entryId: entryId(6), today: TODAY }),
    ).rejects.toBeInstanceOf(DomainValidationError);
    expect(await countPendingOps(adapter)).toBe(opsBefore);

    await unshelveGame(adapter, env, { entryId: entryId(1), today: TODAY });
    await shelveGame(adapter, env, { entryId: entryId(6), today: TODAY });
    expect((await listShelf(adapter)).map((row) => row.gameId)).toEqual([2, 3, 4, 5, 6]);
  });
});
