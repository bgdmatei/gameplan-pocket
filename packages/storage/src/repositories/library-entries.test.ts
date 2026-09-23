import { migrate } from '@gameplan/db-schema';
import { createEntry } from '@gameplan/domain';
import type { LibraryEntry } from '@gameplan/domain';
import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StorageAdapter } from '../adapter';
import { createNodeAdapter } from '../node/adapter';
import { getLibraryEntry, listLibraryEntries, saveLibraryEntry } from './library-entries';

const TODAY = '2026-09-18';
const NOW = '2026-09-18T10:00:00Z';

const cacheGame = async (adapter: StorageAdapter, id: number, name: string): Promise<void> => {
  await adapter.execute('INSERT INTO games (id, name, slug, fetched_at) VALUES (?, ?, ?, ?)', [
    id,
    name,
    `game-${String(id)}`,
    NOW,
  ]);
};

const entryFor = (gameId: number, patch: Partial<LibraryEntry> = {}): LibraryEntry => ({
  ...createEntry(
    { id: `entry-${String(gameId)}`, gameId, status: 'backlog', createdAt: NOW },
    { today: TODAY },
  ),
  ...patch,
});

describe('library entries', () => {
  let adapter: StorageAdapter;

  beforeEach(async () => {
    adapter = createNodeAdapter();
    await migrate(adapter);
  });

  it('round-trips an entry, fields and all', async () => {
    await cacheGame(adapter, 1942, 'The Witcher 3');
    const entry = entryFor(1942, {
      status: 'playing',
      rating: 9,
      platformId: 48,
      progress: { type: 'chapter', value: 'Act II' },
      playtimeMinutes: 1_234,
      startedOn: '2026-09-01',
      favourite: true,
    });

    await saveLibraryEntry(adapter, entry, { updatedAt: NOW });

    expect(await getLibraryEntry(adapter, entry.id)).toEqual(entry);
  });

  /**
   * The guarantee the whole write path exists for: a row saved without its
   * sync operation would never reach another device. Removing the transaction
   * from writeAtomically fails this test and nothing else.
   */
  it('keeps neither the row nor the operation when the write fails halfway', async () => {
    await cacheGame(adapter, 1942, 'The Witcher 3');
    const op = { id: 'op-1', payload: '{}', createdAt: NOW };
    await saveLibraryEntry(adapter, entryFor(7), { updatedAt: NOW, op });

    // The same op id again: the outbox insert fails after the row upsert.
    await expect(
      saveLibraryEntry(adapter, entryFor(1942), { updatedAt: NOW, op }),
    ).rejects.toThrow();

    expect(await getLibraryEntry(adapter, 'entry-1942')).toBeNull();
    expect(await adapter.execute('SELECT id FROM pending_ops')).toEqual([{ id: 'op-1' }]);
  });

  it('moves an archived game out of the library and into the archive', async () => {
    await cacheGame(adapter, 1942, 'The Witcher 3');
    await saveLibraryEntry(adapter, entryFor(1942, { archived: true }), { updatedAt: NOW });

    expect((await listLibraryEntries(adapter)).rows).toEqual([]);
    expect(
      (await listLibraryEntries(adapter, { archived: true })).rows.map((row) => row.game.name),
    ).toEqual(['The Witcher 3']);
  });

  it('fails loudly on a row the domain would not accept', async () => {
    await cacheGame(adapter, 1942, 'The Witcher 3');
    await adapter.execute(
      `INSERT INTO library_entries (id, game_id, status, created_at, updated_at)
       VALUES ('bad', 1942, 'finished', ?, ?)`,
      [NOW, NOW],
    );

    await expect(getLibraryEntry(adapter, 'bad')).rejects.toThrow();
  });

  describe('listing', () => {
    beforeEach(async () => {
      await cacheGame(adapter, 1, 'Alpha Protocol');
      await cacheGame(adapter, 2, "Baldur's Gate 3");
      await cacheGame(adapter, 3, 'Celeste');

      await saveLibraryEntry(
        adapter,
        entryFor(1, { status: 'playing', rating: 5, playtimeMinutes: 100, favourite: true }),
        { updatedAt: '2026-09-01T10:00:00Z' },
      );
      await saveLibraryEntry(
        adapter,
        entryFor(2, { status: 'completed', rating: 10, playtimeMinutes: 6_000 }),
        { updatedAt: '2026-09-03T10:00:00Z' },
      );
      await saveLibraryEntry(adapter, entryFor(3), { updatedAt: '2026-09-02T10:00:00Z' });
    });

    const names = async (options = {}): Promise<string[]> =>
      (await listLibraryEntries(adapter, options)).rows.map((row) => row.game.name);

    it('filters and sorts in SQL', async () => {
      expect(await names({ status: 'playing' })).toEqual(['Alpha Protocol']);
      expect(await names({ favourite: true })).toEqual(['Alpha Protocol']);
      expect(await names({ sort: 'name' })).toEqual([
        'Alpha Protocol',
        "Baldur's Gate 3",
        'Celeste',
      ]);
      expect(await names({ sort: 'recent' })).toEqual([
        "Baldur's Gate 3",
        'Celeste',
        'Alpha Protocol',
      ]);
      // Unrated games sort last rather than dropping out.
      expect(
        (await listLibraryEntries(adapter, { sort: 'rating' })).rows.at(-1)?.entry.rating,
      ).toBeNull();
    });

    it('filters by tag, ignoring tags that were removed', async () => {
      await adapter.execute(
        'INSERT INTO entry_tags (id, entry_id, tag, created_at, deleted) VALUES (?, ?, ?, ?, ?)',
        ['t1', 'entry-2', 'co-op', NOW, 0],
      );
      await adapter.execute(
        'INSERT INTO entry_tags (id, entry_id, tag, created_at, deleted) VALUES (?, ?, ?, ?, ?)',
        ['t2', 'entry-3', 'rpg', NOW, 1],
      );

      expect(await names({ tag: 'co-op' })).toEqual(["Baldur's Gate 3"]);
      expect(await names({ tag: 'rpg' })).toEqual([]);
    });

    it('leaves out an entry whose game is not cached, since a row needs a name', async () => {
      await saveLibraryEntry(adapter, entryFor(404), { updatedAt: NOW });

      expect((await listLibraryEntries(adapter)).rows).toHaveLength(3);
    });

    it('rejects a cursor it did not produce', async () => {
      await expect(listLibraryEntries(adapter, { cursor: 'nonsense' })).rejects.toThrow(/cursor/i);
    });
  });
});

/**
 * Paging is where a library quietly loses rows. Two bugs this caught: without
 * a tiebreaker, entries sharing a sort value repeat or vanish; and a nullable
 * column drops out of cursor comparisons entirely.
 */
describe('paging', () => {
  it('walks every entry exactly once, whatever the page size or sort', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 7 }),
        fc.constantFrom('recent' as const, 'name' as const, 'rating' as const, 'playtime' as const),
        async (pageSize, sort) => {
          const adapter = createNodeAdapter();
          try {
            await migrate(adapter);

            const total = 20;
            for (let index = 0; index < total; index += 1) {
              await cacheGame(adapter, index + 1, `Game ${String(index % 5)}`);
              await saveLibraryEntry(
                adapter,
                entryFor(index + 1, {
                  // Deliberate ties and unrated games: where paging breaks.
                  rating: index % 3 === 0 ? null : index % 4,
                  playtimeMinutes: (index % 3) * 60,
                }),
                { updatedAt: `2026-09-${String(10 + (index % 3)).padStart(2, '0')}T10:00:00Z` },
              );
            }

            const seen: string[] = [];
            let cursor: string | undefined;
            do {
              const page = await listLibraryEntries(adapter, { sort, limit: pageSize, cursor });
              seen.push(...page.rows.map((row) => row.entry.id));
              cursor = page.nextCursor;
            } while (cursor !== undefined);

            expect(new Set(seen).size).toBe(total);
            expect(seen).toHaveLength(total);
          } finally {
            await adapter.close();
          }
        },
      ),
      { numRuns: 15 },
    );
  });
});
