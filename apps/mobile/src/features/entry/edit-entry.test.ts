import { webcrypto } from 'node:crypto';
import { DomainValidationError } from '@gameplan/domain';
import type { Game } from '@gameplan/domain';
import { countPendingOps, getLibraryEntryByGame, upsertGames } from '@gameplan/storage';
import { createMigratedNodeAdapter } from '@gameplan/storage/node';
import type { SyncEnv } from '@gameplan/sync';
import { entryId } from '@gameplan/sync';
import { describe, expect, it } from 'vitest';
import { addGame } from '../library/add-game';
import { editEntry } from './edit-entry';

const TODAY = '2026-09-29';
const env: SyncEnv = {
  now: () => Date.UTC(2026, 8, 29, 18),
  randomBytes: (length) => webcrypto.getRandomValues(new Uint8Array(length)),
};

const HADES: Game = {
  id: 113112,
  name: 'Hades',
  slug: 'hades',
  summary: null,
  firstReleaseDate: '2020-09-17',
  coverImageId: null,
  genreIds: [],
  platformIds: [],
};

describe('editing an entry', () => {
  // Attack: the screen offers only allowed transitions, but a crafted patch
  // must still be refused by the save itself, with nothing written.
  it('refuses a transition the table forbids, writes nothing, and says why', async () => {
    const adapter = await createMigratedNodeAdapter();
    await upsertGames(adapter, { games: [HADES], fetchedAt: '2026-09-29T18:00:00Z' });
    await addGame(adapter, env, { gameId: HADES.id, status: 'wishlist', today: TODAY });
    const before = await getLibraryEntryByGame(adapter, HADES.id);

    const edit = editEntry(adapter, env, {
      entryId: entryId(HADES.id),
      patch: { status: 'completed' },
      today: TODAY,
      gamePlatformIds: [],
    });

    await expect(edit).rejects.toThrow(DomainValidationError);
    await edit.catch((error: unknown) => {
      expect(error instanceof DomainValidationError && error.messages).toEqual([
        'Cannot change status from wishlist to completed.',
      ]);
    });
    expect(await getLibraryEntryByGame(adapter, HADES.id)).toEqual(before);
    expect(await countPendingOps(adapter)).toBe(1);
  });
});
