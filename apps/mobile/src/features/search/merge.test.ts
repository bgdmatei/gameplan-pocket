import type { Game, GameWithEntry, LibraryEntry } from '@gameplan/domain';
import { describe, expect, it } from 'vitest';
import { mergeSearch } from './merge';
import type { RemoteSearch } from './merge';

const game = (id: number, name: string): Game => ({
  id,
  name,
  slug: name.toLowerCase().replace(/\W+/g, '-'),
  summary: null,
  firstReleaseDate: null,
  coverImageId: null,
  genreIds: [],
  platformIds: [],
});

const WITCHER = game(1942, 'The Witcher 3');
const WITCHER_2 = game(478, 'The Witcher 2');
const WITCHER_1 = game(471, 'The Witcher');
const entry = { id: 'e-1942', gameId: 1942, status: 'playing' } as LibraryEntry;

const local: GameWithEntry[] = [
  { game: WITCHER, entry },
  { game: WITCHER_2, entry: null },
];

describe('mergeSearch', () => {
  // The local list answers at once and must not jump when the server answers:
  // local rows keep their order and their library status, new games follow.
  it.each<{ case: string; remote: RemoteSearch; ids: number[]; notice: string | null }>([
    { case: 'no remote answer yet', remote: { kind: 'waiting' }, ids: [1942, 478], notice: null },
    {
      case: 'a fresh answer overlapping local results',
      remote: { kind: 'ok', value: [WITCHER_1, WITCHER, WITCHER_2], stale: false },
      ids: [1942, 478, 471],
      notice: null,
    },
    {
      case: 'a stale answer from the server cache',
      remote: { kind: 'ok', value: [WITCHER_1], stale: true },
      ids: [1942, 478, 471],
      notice: 'incomplete',
    },
    { case: 'no connection', remote: { kind: 'offline' }, ids: [1942, 478], notice: 'offline' },
    { case: 'a server error', remote: { kind: 'failed' }, ids: [1942, 478], notice: 'incomplete' },
  ])('with $case', ({ remote, ids, notice }) => {
    const merged = mergeSearch(local, remote);

    expect(merged.rows.map((row) => row.game.id)).toEqual(ids);
    expect(merged.rows[0]?.entry).toBe(entry);
    expect(merged.notice).toBe(notice);
  });
});
