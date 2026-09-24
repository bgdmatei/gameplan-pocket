import { webcrypto } from 'node:crypto';
import { applyEntryChange, createNoteItem } from '@gameplan/domain';
import type { Game } from '@gameplan/domain';
import { countPendingOps, getGame, getLibraryEntryByGame, listNoteItems } from '@gameplan/storage';
import type { StorageAdapter } from '@gameplan/storage';
import { createMigratedNodeAdapter } from '@gameplan/storage/node';
import { commitLocalCreate, commitLocalEdit, entryId, newId } from '@gameplan/sync';
import type { SyncEnv } from '@gameplan/sync';
import { beforeEach, describe, expect, it } from 'vitest';
import { addGame, cacheGame } from './add-game';
import type { ReferenceSource } from './add-game';

const TODAY = '2026-09-24';
const env: SyncEnv = {
  now: () => Date.UTC(2026, 8, 24, 18),
  randomBytes: (length) => webcrypto.getRandomValues(new Uint8Array(length)),
};

const WITCHER: Game = {
  id: 1942,
  name: 'The Witcher 3: Wild Hunt',
  slug: 'the-witcher-3-wild-hunt',
  summary: null,
  firstReleaseDate: '2015-05-19',
  coverImageId: 'co1wyy',
  genreIds: [12],
  platformIds: [6],
};

const reference = () => {
  let calls = 0;
  const source: ReferenceSource = {
    getReference: async () => {
      calls += 1;
      return {
        kind: 'ok',
        stale: false,
        value: {
          genres: [{ id: 12, name: 'Role-playing (RPG)', slug: 'role-playing-rpg' }],
          platforms: [{ id: 6, name: 'PC (Microsoft Windows)', abbreviation: 'PC' }],
        },
      };
    },
  };
  return { source, calls: () => calls };
};

describe('adding a game', () => {
  let adapter: StorageAdapter;

  beforeEach(async () => {
    adapter = await createMigratedNodeAdapter();
  });

  // A game refers to genres and platforms by id, and the phone's tables refuse
  // one whose genres it has not cached: fetch those first, and only when needed.
  it('caches a game, fetching genres and platforms only when one is new', async () => {
    const { source, calls } = reference();

    expect(await cacheGame(adapter, source, WITCHER, '2026-09-24T18:00:00Z')).toBe(true);
    expect(await cacheGame(adapter, source, { ...WITCHER, id: 478 }, '2026-09-24T18:00:00Z')).toBe(
      true,
    );

    expect(calls()).toBe(1);
    expect(await getGame(adapter, 1942)).toEqual(WITCHER);
  });

  it('creates the entry with the chosen status and one op to sync', async () => {
    await cacheGame(adapter, reference().source, WITCHER, '2026-09-24T18:00:00Z');

    expect(await addGame(adapter, env, { gameId: 1942, status: 'playing', today: TODAY })).toBe(
      'added',
    );

    expect(await getLibraryEntryByGame(adapter, 1942)).toMatchObject({
      id: entryId(1942),
      status: 'playing',
      startedOn: TODAY,
    });
    expect(await countPendingOps(adapter)).toBe(1);
  });

  // Games are archived, never deleted (SPEC-domain-model.md decision 12), so
  // adding one again must bring back the same row with its history.
  it('brings an archived game back with its rating and notes', async () => {
    await cacheGame(adapter, reference().source, WITCHER, '2026-09-24T18:00:00Z');
    await addGame(adapter, env, { gameId: 1942, status: 'completed', today: TODAY });
    await commitLocalEdit(adapter, env, {
      entity: 'library_entry',
      id: entryId(1942),
      update: (current) =>
        applyEntryChange(current, { rating: 8, archived: true }, { today: TODAY }),
    });
    const note = createNoteItem({
      id: newId(env.randomBytes, env.now()),
      entryId: entryId(1942),
      createdAt: '2026-09-24T18:00:00Z',
      type: 'secret',
      text: 'Hidden chest behind the mill',
    });
    await commitLocalCreate(adapter, env, { entity: 'note_item', next: note });

    expect(await addGame(adapter, env, { gameId: 1942, status: 'backlog', today: TODAY })).toBe(
      'restored',
    );

    expect(await getLibraryEntryByGame(adapter, 1942)).toMatchObject({
      archived: false,
      status: 'completed',
      rating: 8,
    });
    expect(await listNoteItems(adapter, entryId(1942))).toHaveLength(1);
  });
});
