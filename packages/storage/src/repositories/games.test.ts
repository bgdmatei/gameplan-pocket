import { migrate } from '@gameplan/db-schema';
import { createEntry, createListItem } from '@gameplan/domain';
import type { Game } from '@gameplan/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StorageAdapter } from '../adapter';
import { createNodeAdapter } from '../node/adapter';
import { saveLibraryEntry } from './library-entries';
import { addGameToList, saveList } from './lists';
import { getGame, getGamesByIds, pruneCatalog, searchGames, upsertGames } from './games';

const NOW = '2026-09-20T10:00:00Z';

const gameOf = (id: number, name: string, patch: Partial<Game> = {}): Game => ({
  id,
  name,
  slug: name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-'),
  summary: null,
  firstReleaseDate: null,
  coverImageId: null,
  genreIds: [],
  platformIds: [],
  ...patch,
});

/** Real titles: apostrophes, colons, numerals, long subtitles. */
const CATALOG: Game[] = [
  gameOf(1, "Assassin's Creed II"),
  gameOf(2, 'The Witcher 3: Wild Hunt'),
  gameOf(3, 'Baldur’s Gate 3'),
  gameOf(4, 'Celeste'),
  gameOf(5, 'Final Fantasy VII Remake Intergrade'),
  gameOf(6, 'Half-Life 2'),
];

describe('catalog', () => {
  let adapter: StorageAdapter;

  beforeEach(async () => {
    adapter = createNodeAdapter();
    await migrate(adapter);
  });

  describe('upsertGames', () => {
    it('stores a game and reads it back', async () => {
      const game = gameOf(1, 'Celeste', {
        summary: 'A mountain to climb.',
        firstReleaseDate: '2018-01-25',
        coverImageId: 'co1x9z',
      });

      await upsertGames(adapter, { games: [game], fetchedAt: NOW });

      expect(await getGame(adapter, 1)).toEqual(game);
    });

    it('updates a game already cached, without duplicating it', async () => {
      await upsertGames(adapter, { games: [gameOf(1, 'Celest')], fetchedAt: NOW });

      await upsertGames(adapter, { games: [gameOf(1, 'Celeste')], fetchedAt: NOW });

      expect((await getGame(adapter, 1))?.name).toBe('Celeste');
      expect(await adapter.execute('SELECT COUNT(*) AS count FROM games')).toEqual([{ count: 1 }]);
    });

    it('stores genres and platforms, and replaces them on a later fetch', async () => {
      await upsertGames(adapter, {
        games: [gameOf(1, 'Celeste', { genreIds: [8, 31], platformIds: [6, 48] })],
        genres: [
          { id: 8, name: 'Platform', slug: 'platform' },
          { id: 31, name: 'Adventure', slug: 'adventure' },
        ],
        platforms: [
          { id: 6, name: 'PC (Microsoft Windows)', abbreviation: 'PC' },
          { id: 48, name: 'PlayStation 4', abbreviation: 'PS4' },
        ],
        fetchedAt: NOW,
      });

      expect(await getGame(adapter, 1)).toMatchObject({ genreIds: [8, 31], platformIds: [6, 48] });

      // IGDB corrected the data: one genre, one platform.
      await upsertGames(adapter, {
        games: [gameOf(1, 'Celeste', { genreIds: [8], platformIds: [6] })],
        fetchedAt: NOW,
      });

      expect(await getGame(adapter, 1)).toMatchObject({ genreIds: [8], platformIds: [6] });
    });

    it('is idempotent for genres and platforms shared by many games', async () => {
      const payload = {
        games: [
          gameOf(1, 'Celeste', { genreIds: [8] }),
          gameOf(2, 'Hollow Knight', { genreIds: [8] }),
        ],
        genres: [{ id: 8, name: 'Platform', slug: 'platform' }],
        fetchedAt: NOW,
      };

      await upsertGames(adapter, payload);
      await upsertGames(adapter, payload);

      expect(await adapter.execute('SELECT COUNT(*) AS count FROM genres')).toEqual([{ count: 1 }]);
      expect(await adapter.execute('SELECT COUNT(*) AS count FROM game_genres')).toEqual([
        { count: 2 },
      ]);
    });

    it('writes nothing when one game in the batch is invalid', async () => {
      await expect(
        upsertGames(adapter, {
          games: [gameOf(1, 'Celeste'), { ...gameOf(2, 'Broken'), id: 0 }],
          fetchedAt: NOW,
        }),
      ).rejects.toThrow();

      expect(await adapter.execute('SELECT COUNT(*) AS count FROM games')).toEqual([{ count: 0 }]);
    });
  });

  describe('getGamesByIds', () => {
    it('returns the games asked for, in the order asked for', async () => {
      await upsertGames(adapter, { games: CATALOG, fetchedAt: NOW });

      expect((await getGamesByIds(adapter, [4, 1, 6])).map((game) => game.id)).toEqual([4, 1, 6]);
    });

    it('leaves out ids it has never seen, rather than failing', async () => {
      await upsertGames(adapter, { games: CATALOG, fetchedAt: NOW });

      expect((await getGamesByIds(adapter, [4, 999])).map((game) => game.id)).toEqual([4]);
    });

    it('returns nothing for an empty list, without querying', async () => {
      expect(await getGamesByIds(adapter, [])).toEqual([]);
    });
  });

  describe('searchGames', () => {
    beforeEach(async () => {
      await upsertGames(adapter, { games: CATALOG, fetchedAt: NOW });
    });

    const found = async (query: string): Promise<string[]> =>
      (await searchGames(adapter, query)).map((row) => row.game.name);

    it('finds a game by its first word', async () => {
      expect(await found('celeste')).toEqual(['Celeste']);
    });

    it('finds a game by a word in the middle of the title', async () => {
      expect(await found('wild')).toEqual(['The Witcher 3: Wild Hunt']);
    });

    it('matches a prefix, so results appear while typing', async () => {
      expect(await found('cele')).toEqual(['Celeste']);
      expect(await found('witch')).toEqual(['The Witcher 3: Wild Hunt']);
    });

    it('ignores case', async () => {
      expect(await found('CELESTE')).toEqual(['Celeste']);
    });

    it('finds titles containing an apostrophe, typed with or without it', async () => {
      expect(await found("assassin's")).toEqual(["Assassin's Creed II"]);
      expect(await found('assassins')).toEqual(["Assassin's Creed II"]);
      expect(await found('baldur')).toEqual(['Baldur’s Gate 3']);
    });

    it('finds a title past its colon', async () => {
      expect(await found('hunt')).toEqual(['The Witcher 3: Wild Hunt']);
    });

    it('finds numerals and roman numerals', async () => {
      expect(await found('3')).toEqual(
        expect.arrayContaining(['The Witcher 3: Wild Hunt', 'Baldur’s Gate 3']),
      );
      expect(await found('vii')).toEqual(['Final Fantasy VII Remake Intergrade']);
    });

    it('finds a hyphenated title from either half', async () => {
      expect(await found('half')).toEqual(['Half-Life 2']);
      expect(await found('life')).toEqual(['Half-Life 2']);
    });

    it('requires every word, so two words narrow the results', async () => {
      expect(await found('final fantasy')).toEqual(['Final Fantasy VII Remake Intergrade']);
      expect(await found('celeste fantasy')).toEqual([]);
    });

    it('survives characters that would break a search expression', async () => {
      for (const query of [
        '"',
        '*',
        'AND',
        'OR',
        'NOT',
        'a AND b',
        'foo*',
        '(',
        'NEAR(a b)',
        '^',
      ]) {
        await expect(searchGames(adapter, query)).resolves.toBeInstanceOf(Array);
      }
    });

    it('returns nothing for a query with no letters or digits', async () => {
      expect(await found('   ')).toEqual([]);
      expect(await found('!!!')).toEqual([]);
    });

    it('respects the limit', async () => {
      expect(await searchGames(adapter, '3', { limit: 1 })).toHaveLength(1);
    });

    it('says whether each game is already in the library', async () => {
      await saveLibraryEntry(
        adapter,
        createEntry(
          { id: 'entry-4', gameId: 4, status: 'playing', createdAt: NOW },
          {
            today: '2026-09-20',
          },
        ),
        { updatedAt: NOW },
      );

      const [result] = await searchGames(adapter, 'celeste');

      expect(result?.entry?.status).toBe('playing');
      expect((await searchGames(adapter, 'witcher'))[0]?.entry).toBeNull();
    });

    it('treats a removed game as not in the library', async () => {
      await saveLibraryEntry(
        adapter,
        createEntry(
          { id: 'entry-4', gameId: 4, status: 'playing', createdAt: NOW },
          {
            today: '2026-09-20',
          },
        ),
        { updatedAt: NOW },
      );
      await adapter.execute('UPDATE library_entries SET deleted = 1 WHERE id = ?', ['entry-4']);

      expect((await searchGames(adapter, 'celeste'))[0]?.entry).toBeNull();
    });

    it('keeps search in step when a game is renamed or removed', async () => {
      await upsertGames(adapter, { games: [gameOf(4, 'Celeste 64')], fetchedAt: NOW });
      expect(await found('celeste')).toEqual(['Celeste 64']);

      await adapter.execute('DELETE FROM games WHERE id = ?', [4]);
      expect(await found('celeste')).toEqual([]);
    });
  });

  describe('pruneCatalog', () => {
    beforeEach(async () => {
      await upsertGames(adapter, { games: CATALOG, fetchedAt: '2026-01-01T10:00:00Z' });
    });

    it('keeps games in the library', async () => {
      await saveLibraryEntry(
        adapter,
        createEntry(
          { id: 'entry-4', gameId: 4, status: 'backlog', createdAt: NOW },
          {
            today: '2026-09-20',
          },
        ),
        { updatedAt: NOW },
      );

      await pruneCatalog(adapter, { keepFetchedSince: NOW });

      expect((await getGamesByIds(adapter, [4])).map((game) => game.id)).toEqual([4]);
    });

    it('keeps games on a list', async () => {
      await saveList(
        adapter,
        { id: 'list-1', name: 'Co-op', description: null, createdAt: NOW },
        { updatedAt: NOW },
      );
      await addGameToList(
        adapter,
        createListItem({ id: 'i-1', listId: 'list-1', gameId: 6, addedAt: NOW }),
      );

      await pruneCatalog(adapter, { keepFetchedSince: NOW });

      expect((await getGamesByIds(adapter, [6])).map((game) => game.id)).toEqual([6]);
    });

    it('keeps games fetched recently, which are the ones just searched for', async () => {
      await upsertGames(adapter, {
        games: [gameOf(2, 'The Witcher 3: Wild Hunt')],
        fetchedAt: NOW,
      });

      await pruneCatalog(adapter, { keepFetchedSince: '2026-09-19T00:00:00Z' });

      expect((await getGamesByIds(adapter, [2])).map((game) => game.id)).toEqual([2]);
    });

    it('drops everything else, and reports how many it dropped', async () => {
      const removed = await pruneCatalog(adapter, { keepFetchedSince: NOW });

      expect(removed).toBe(CATALOG.length);
      expect(await adapter.execute('SELECT COUNT(*) AS count FROM games')).toEqual([{ count: 0 }]);
    });

    it('takes the pruned games out of search too', async () => {
      await pruneCatalog(adapter, { keepFetchedSince: NOW });

      expect(await searchGames(adapter, 'celeste')).toEqual([]);
    });

    it('leaves join rows behind for no game', async () => {
      await upsertGames(adapter, {
        games: [gameOf(4, 'Celeste', { genreIds: [8] })],
        genres: [{ id: 8, name: 'Platform', slug: 'platform' }],
        fetchedAt: '2026-01-01T10:00:00Z',
      });

      await pruneCatalog(adapter, { keepFetchedSince: NOW });

      expect(await adapter.execute('SELECT COUNT(*) AS count FROM game_genres')).toEqual([
        { count: 0 },
      ]);
    });
  });
});
