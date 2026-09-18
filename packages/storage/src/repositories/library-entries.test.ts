import { migrate } from '@gameplan/db-schema';
import { createEntry } from '@gameplan/domain';
import type { LibraryEntry } from '@gameplan/domain';
import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StorageAdapter } from '../adapter';
import { createNodeAdapter } from '../node/adapter';
import {
  getLibraryEntry,
  getLibraryEntryByGame,
  listLibraryEntries,
  saveLibraryEntry,
  softDeleteLibraryEntry,
} from './library-entries';
import { writeAtomically } from './write';

const TODAY = '2026-09-18';
const NOW = '2026-09-18T10:00:00Z';

const cacheGame = async (adapter: StorageAdapter, id: number, name: string): Promise<void> => {
  await adapter.execute('INSERT INTO games (id, name, slug, fetched_at) VALUES (?, ?, ?, ?)', [
    id,
    name,
    name.toLowerCase().replaceAll(' ', '-'),
    NOW,
  ]);
};

const entryFor = (gameId: number, patch: Partial<LibraryEntry> = {}): LibraryEntry => ({
  ...createEntry(
    { id: `entry-${gameId}`, gameId, status: 'backlog', createdAt: NOW },
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

  describe('saveLibraryEntry', () => {
    it('round-trips an entry through the database', async () => {
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

    it('stores its outbox entry in the same write', async () => {
      await cacheGame(adapter, 1942, 'The Witcher 3');
      const entry = entryFor(1942);

      await saveLibraryEntry(adapter, entry, {
        updatedAt: NOW,
        op: { id: 'op-1', payload: '{"kind":"set"}', createdAt: NOW },
      });

      expect(await adapter.execute('SELECT id, payload FROM pending_ops')).toEqual([
        { id: 'op-1', payload: '{"kind":"set"}' },
      ]);
    });

    it('updates an existing entry rather than adding a second one', async () => {
      await cacheGame(adapter, 1942, 'The Witcher 3');
      const entry = entryFor(1942);
      await saveLibraryEntry(adapter, entry, { updatedAt: NOW });

      await saveLibraryEntry(adapter, { ...entry, rating: 7 }, { updatedAt: NOW });

      expect(await adapter.execute('SELECT COUNT(*) AS count FROM library_entries')).toEqual([
        { count: 1 },
      ]);
      expect((await getLibraryEntry(adapter, entry.id))?.rating).toBe(7);
    });

    it('keeps nothing when the outbox write fails, so a row can never sync-less', async () => {
      await cacheGame(adapter, 1942, 'The Witcher 3');
      const entry = entryFor(1942);
      const op = { id: 'op-1', payload: '{}', createdAt: NOW };
      await saveLibraryEntry(adapter, entryFor(7, {}), { updatedAt: NOW, op }).catch(() => {});

      // The same op id again: the outbox insert fails after the row upsert.
      await expect(saveLibraryEntry(adapter, entry, { updatedAt: NOW, op })).rejects.toThrow();

      expect(await getLibraryEntry(adapter, entry.id)).toBeNull();
      expect(await adapter.execute('SELECT id FROM pending_ops')).toEqual([{ id: 'op-1' }]);
    });

    it('rejects a row the domain would not accept, rather than storing it', async () => {
      await cacheGame(adapter, 1942, 'The Witcher 3');
      await adapter.execute(
        `INSERT INTO library_entries (id, game_id, status, created_at, updated_at)
         VALUES ('bad', 1942, 'finished', ?, ?)`,
        [NOW, NOW],
      );

      await expect(getLibraryEntry(adapter, 'bad')).rejects.toThrow();
    });
  });

  describe('getLibraryEntryByGame', () => {
    it('finds the one entry for a game', async () => {
      await cacheGame(adapter, 1942, 'The Witcher 3');
      await saveLibraryEntry(adapter, entryFor(1942), { updatedAt: NOW });

      expect((await getLibraryEntryByGame(adapter, 1942))?.gameId).toBe(1942);
      expect(await getLibraryEntryByGame(adapter, 999)).toBeNull();
    });
  });

  describe('softDeleteLibraryEntry', () => {
    it('hides the entry but keeps the row, so the removal can sync', async () => {
      await cacheGame(adapter, 1942, 'The Witcher 3');
      const entry = entryFor(1942);
      await saveLibraryEntry(adapter, entry, { updatedAt: NOW });

      await softDeleteLibraryEntry(adapter, entry.id, { updatedAt: NOW });

      expect(await getLibraryEntry(adapter, entry.id)).toBeNull();
      expect((await listLibraryEntries(adapter)).rows).toEqual([]);
      expect(
        await adapter.execute('SELECT deleted FROM library_entries WHERE id = ?', [entry.id]),
      ).toEqual([{ deleted: 1 }]);
    });

    it('records the removal in the outbox, so other devices hear about it', async () => {
      await cacheGame(adapter, 1942, 'The Witcher 3');
      const entry = entryFor(1942);
      await saveLibraryEntry(adapter, entry, { updatedAt: NOW });

      await softDeleteLibraryEntry(adapter, entry.id, {
        updatedAt: NOW,
        op: { id: 'op-del', payload: '{"kind":"delete"}', createdAt: NOW },
      });

      expect(await adapter.execute('SELECT id, payload FROM pending_ops')).toEqual([
        { id: 'op-del', payload: '{"kind":"delete"}' },
      ]);
    });
  });

  describe('listLibraryEntries', () => {
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
      await saveLibraryEntry(adapter, entryFor(3, { status: 'backlog', playtimeMinutes: 0 }), {
        updatedAt: '2026-09-02T10:00:00Z',
      });
    });

    const names = async (options = {}): Promise<string[]> =>
      (await listLibraryEntries(adapter, options)).rows.map((row) => row.game.name);

    it('returns the entry with its game', async () => {
      const { rows } = await listLibraryEntries(adapter, { sort: 'name', limit: 1 });

      expect(rows[0]?.game.name).toBe('Alpha Protocol');
      expect(rows[0]?.entry.gameId).toBe(1);
    });

    it('filters by status', async () => {
      expect(await names({ status: 'playing' })).toEqual(['Alpha Protocol']);
    });

    it('filters by favourite', async () => {
      expect(await names({ favourite: true })).toEqual(['Alpha Protocol']);
      expect(await names({ favourite: false })).toEqual(
        expect.arrayContaining(["Baldur's Gate 3", 'Celeste']),
      );
    });

    it('filters by tag', async () => {
      await adapter.execute(
        'INSERT INTO entry_tags (id, entry_id, tag, created_at) VALUES (?, ?, ?, ?)',
        ['tag-1', 'entry-2', 'co-op', NOW],
      );

      expect(await names({ tag: 'co-op' })).toEqual(["Baldur's Gate 3"]);
      expect(await names({ tag: 'rpg' })).toEqual([]);
    });

    it('ignores a tag that has been removed', async () => {
      await adapter.execute(
        'INSERT INTO entry_tags (id, entry_id, tag, created_at, deleted) VALUES (?, ?, ?, ?, 1)',
        ['tag-1', 'entry-2', 'co-op', NOW],
      );

      expect(await names({ tag: 'co-op' })).toEqual([]);
    });

    it.each([
      ['recent', ["Baldur's Gate 3", 'Celeste', 'Alpha Protocol']],
      ['name', ['Alpha Protocol', "Baldur's Gate 3", 'Celeste']],
      ['rating', ["Baldur's Gate 3", 'Alpha Protocol', 'Celeste']],
      ['playtime', ["Baldur's Gate 3", 'Alpha Protocol', 'Celeste']],
    ] as const)('sorts by %s', async (sort, expected) => {
      expect(await names({ sort })).toEqual(expected);
    });

    it('puts unrated games last when sorting by rating', async () => {
      const { rows } = await listLibraryEntries(adapter, { sort: 'rating' });

      expect(rows[rows.length - 1]?.entry.rating).toBeNull();
    });

    it('leaves out an entry whose game is not cached', async () => {
      await saveLibraryEntry(adapter, entryFor(404), { updatedAt: NOW });

      expect(await names()).not.toContain(undefined);
      expect((await listLibraryEntries(adapter)).rows).toHaveLength(3);
    });

    it('pages with a cursor and stops at the end', async () => {
      const first = await listLibraryEntries(adapter, { sort: 'name', limit: 2 });
      expect(first.rows.map((row) => row.game.name)).toEqual(['Alpha Protocol', "Baldur's Gate 3"]);
      expect(first.nextCursor).toBeDefined();

      const second = await listLibraryEntries(adapter, {
        sort: 'name',
        limit: 2,
        cursor: first.nextCursor,
      });
      expect(second.rows.map((row) => row.game.name)).toEqual(['Celeste']);
      expect(second.nextCursor).toBeUndefined();
    });

    it('rejects a cursor it did not produce', async () => {
      await expect(listLibraryEntries(adapter, { cursor: 'nonsense' })).rejects.toThrow(/cursor/i);
    });

    it('uses an index rather than scanning the table', async () => {
      const plan = (
        await adapter.execute<{ detail: string }>(
          `EXPLAIN QUERY PLAN
           SELECT e.id FROM library_entries e JOIN games g ON g.id = e.game_id
           WHERE e.deleted = 0 ORDER BY e.updated_at DESC, e.id DESC LIMIT 50`,
        )
      )
        .map((row) => row.detail)
        .join(' ');

      expect(plan).toMatch(/USING INDEX/);
    });
  });
});

describe('writeAtomically', () => {
  it('refuses a row that carries nothing but an id', async () => {
    const adapter = createNodeAdapter();
    await migrate(adapter);

    await expect(
      writeAtomically(adapter, { rows: [{ table: 'lists', row: { id: 'list-1' } }] }),
    ).rejects.toThrow(/more than an id/);

    await adapter.close();
  });
});

describe('paging properties', () => {
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
                  // Deliberate ties and nulls: rows sharing a sort value are
                  // where paging usually repeats or drops entries.
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
      { numRuns: 25 },
    );
  });
});
