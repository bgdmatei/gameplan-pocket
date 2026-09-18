import { describe, expect, it } from 'vitest';
import { isInLibrary } from './view';
import type { GameWithEntry } from './view';
import type { LibraryEntry } from '../library-entry/schema';
import type { Game } from './schema';

const game: Game = {
  id: 1942,
  name: 'The Witcher 3: Wild Hunt',
  slug: 'the-witcher-3-wild-hunt',
  summary: null,
  firstReleaseDate: null,
  coverImageId: null,
  genreIds: [],
  platformIds: [],
};

const entry: LibraryEntry = {
  id: 'entry-1',
  gameId: game.id,
  status: 'playing',
  rating: 9,
  platformId: null,
  progress: null,
  playtimeMinutes: 120,
  startedOn: '2026-09-18',
  finishedOn: null,
  favourite: true,
  createdAt: '2026-09-18T10:00:00Z',
};

describe('isInLibrary', () => {
  it('is false for a catalog game the user does not track', () => {
    const view: GameWithEntry = { game, entry: null };
    expect(isInLibrary(view)).toBe(false);
  });

  it('is true once the game has an entry, so every screen shows the same status', () => {
    const view: GameWithEntry = { game, entry };
    expect(isInLibrary(view)).toBe(true);
    expect(view.entry?.status).toBe('playing');
    expect(view.entry?.rating).toBe(9);
  });
});
