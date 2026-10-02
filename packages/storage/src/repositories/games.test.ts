import { migrate } from '@gameplan/db-schema';
import { createEntry } from '@gameplan/domain';
import type { Game } from '@gameplan/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StorageAdapter } from '../adapter';
import { createNodeAdapter } from '../node/adapter';
import { getGame, getGamesByIds, pruneCatalog, searchGames, upsertGames } from './games';
import { putRows } from '../testing/rows';
import { SYNCED_ROWS } from './synced-rows';

const NOW = '2026-09-20T10:00:00Z';

const gameOf = (id: number, name: string, patch: Partial<Game> = {}): Game => ({
  id,
  name,
  slug: `game-${String(id)}`,
  summary: null,
  firstReleaseDate: null,
  coverImageId: null,
  genreIds: [],
  platformIds: [],
  ...patch,
});

/** Real titles: apostrophes, colons, numerals, hyphens. */
const CATALOG: Game[] = [
  gameOf(1, "Assassin's Creed II"),
  gameOf(2, 'The Witcher 3: Wild Hunt'),
  gameOf(3, 'Baldur’s Gate 3'),
  gameOf(4, 'Celeste'),
  gameOf(5, 'Half-Life 2'),
];

describe('catalog', () => {
  let adapter: StorageAdapter;

  beforeEach(async () => {
    adapter = createNodeAdapter();
    await migrate(adapter);
  });

  it('caches a game and replaces its genres on a later fetch', async () => {
    await upsertGames(adapter, {
      games: [gameOf(1, 'Celeste', { genreIds: [8, 31] })],
      genres: [
        { id: 8, name: 'Platform', slug: 'platform' },
        { id: 31, name: 'Adventure', slug: 'adventure' },
      ],
      fetchedAt: NOW,
    });

    // The server is authoritative: a genre removed upstream must not linger.
    await upsertGames(adapter, {
      games: [gameOf(1, 'Celeste', { genreIds: [8] })],
      fetchedAt: NOW,
    });

    expect(await getGame(adapter, 1)).toMatchObject({ name: 'Celeste', genreIds: [8] });
    expect(await adapter.execute('SELECT COUNT(*) AS count FROM games')).toEqual([{ count: 1 }]);
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

  it('returns requested games in the order asked for, skipping unknown ids', async () => {
    await upsertGames(adapter, { games: CATALOG, fetchedAt: NOW });

    expect((await getGamesByIds(adapter, [4, 1, 999])).map((game) => game.id)).toEqual([4, 1]);
  });

  describe('search', () => {
    beforeEach(async () => {
      await upsertGames(adapter, { games: CATALOG, fetchedAt: NOW });
    });

    const found = async (query: string): Promise<string[]> =>
      (await searchGames(adapter, query)).map((row) => row.game.name);

    it('matches words anywhere in a title, by prefix, ignoring case', async () => {
      expect(await found('cele')).toEqual(['Celeste']);
      expect(await found('wild')).toEqual(['The Witcher 3: Wild Hunt']);
      expect(await found('LIFE')).toEqual(['Half-Life 2']);
      expect(await found('final fantasy')).toEqual([]);
    });

    /** Bug: typing without the apostrophe found nothing, which is how people type. */
    it('finds a possessive title typed with or without the apostrophe', async () => {
      expect(await found("assassin's")).toEqual(["Assassin's Creed II"]);
      expect(await found('assassins')).toEqual(["Assassin's Creed II"]);
      expect(await found('baldurs')).toEqual(['Baldur’s Gate 3']);
    });

    it('survives characters that would otherwise break the query', async () => {
      for (const query of ['"', '*', 'AND', 'NEAR(a b)', '(', '^']) {
        await expect(searchGames(adapter, query)).resolves.toEqual([]);
      }
      expect(await found('   ')).toEqual([]);
    });

    it('says whether each result is already in the library', async () => {
      await putRows(
        adapter,
        SYNCED_ROWS.library_entries,
        [
          createEntry(
            { id: 'entry-4', gameId: 4, status: 'playing', createdAt: NOW },
            { today: '2026-09-20' },
          ),
        ],
        { now: NOW },
      );

      expect((await searchGames(adapter, 'celeste'))[0]?.entry?.status).toBe('playing');
      expect((await searchGames(adapter, 'witcher'))[0]?.entry).toBeNull();
    });

    it('keeps the index in step when a game is renamed or removed', async () => {
      await upsertGames(adapter, { games: [gameOf(4, 'Celeste 64')], fetchedAt: NOW });
      expect(await found('celeste')).toEqual(['Celeste 64']);

      await adapter.execute('DELETE FROM games WHERE id = ?', [4]);
      expect(await found('celeste')).toEqual([]);
    });
  });

  it('prunes only games nothing needs, and takes them out of search', async () => {
    await upsertGames(adapter, { games: CATALOG, fetchedAt: '2026-01-01T10:00:00Z' });
    await putRows(
      adapter,
      SYNCED_ROWS.library_entries,
      [
        createEntry(
          { id: 'entry-4', gameId: 4, status: 'backlog', createdAt: NOW },
          { today: '2026-09-20' },
        ),
      ],
      { now: NOW },
    );

    const removed = await pruneCatalog(adapter, { keepFetchedSince: NOW });

    expect(removed).toBe(CATALOG.length - 1);
    expect((await getGamesByIds(adapter, [4])).map((game) => game.id)).toEqual([4]);
    expect(await searchGames(adapter, 'witcher')).toEqual([]);
    // Join rows follow through the schema's cascade.
    expect(await adapter.execute('SELECT COUNT(*) AS count FROM game_genres')).toEqual([
      { count: 0 },
    ]);
  });
});
