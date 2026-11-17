import { createEntry } from '@gameplan/domain';
import type { Game } from '@gameplan/domain';
import { upsertGames } from '@gameplan/storage';
import { createMigratedNodeAdapter } from '@gameplan/storage/node';
import { commitLocalCreate, entryId } from '@gameplan/sync';
import { describe, expect, it } from 'vitest';
import type { CoverStore } from '@/data/cover-store';
import { testEnv } from '../account/test-fixtures';
import { fillCovers } from './fill-covers';

const game = (id: number, coverImageId: string | null): Game => ({
  id,
  name: `Game ${String(id)}`,
  slug: `game-${String(id)}`,
  summary: null,
  firstReleaseDate: null,
  coverImageId,
  genreIds: [],
  platformIds: [],
  developer: null,
});

const fakeStore = (initial: string[]) => {
  const stored = new Set(initial);
  const downloaded: string[] = [];
  const store: CoverStore = {
    stored: () => stored,
    download: (id) => {
      downloaded.push(id);
      stored.add(id);
      return Promise.resolve();
    },
    remove: (id) => {
      stored.delete(id);
    },
  };
  return { store, stored, downloaded };
};

describe('fillCovers', () => {
  it('fetches missing library covers up to the cap, and drops covers no library game uses', async () => {
    const adapter = await createMigratedNodeAdapter();
    // 60 library games with covers, one without, and one cached by a search
    // but never added. 'replaced' stands for a cover IGDB has since changed.
    const games = [
      ...Array.from({ length: 60 }, (_, i) => game(i + 1, `cov${String(i + 1)}`)),
      game(100, null),
      game(200, 'search-only'),
    ];
    await upsertGames(adapter, { games, fetchedAt: '2026-11-16T10:00:00Z' });
    for (const gameId of [...Array.from({ length: 60 }, (_, i) => i + 1), 100]) {
      await commitLocalCreate(adapter, testEnv, {
        entity: 'library_entry',
        next: createEntry(
          { id: entryId(gameId), gameId, status: 'backlog', createdAt: '2026-11-16T10:00:00Z' },
          { today: '2026-11-16' },
        ),
      });
    }

    const { store, stored, downloaded } = fakeStore(['cov1', 'replaced', 'search-only']);
    await fillCovers(adapter, store, () => Promise.resolve(true));

    expect(downloaded).toHaveLength(50);
    expect(downloaded).not.toContain('cov1');
    expect(downloaded.every((id) => id.startsWith('cov'))).toBe(true);
    expect(stored.has('replaced')).toBe(false);
    expect(stored.has('search-only')).toBe(false);

    // The next sync takes the rest, and nothing twice.
    downloaded.length = 0;
    await fillCovers(adapter, store, () => Promise.resolve(true));
    expect(downloaded).toHaveLength(9);

    // Signed out (or off Wi-Fi) part-way: nothing more is fetched.
    const fresh = fakeStore([]);
    let allowed = 3;
    await fillCovers(adapter, fresh.store, () => Promise.resolve(allowed-- > 0));
    expect(fresh.downloaded).toHaveLength(3);
    await adapter.close();
  });
});
