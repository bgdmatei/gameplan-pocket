import { createEntry, createEntryTag, createNoteItem, tagIdentityKey } from '@gameplan/domain';
import type { EntryStatus, Game } from '@gameplan/domain';
import type { StorageAdapter } from '../adapter';
import { addEntryTag } from '../repositories/entry-tags';
import { upsertGames } from '../repositories/games';
import { saveLibraryEntry } from '../repositories/library-entries';
import { saveNoteItem } from '../repositories/note-items';

/**
 * Fills a database with a library the size of a heavy user's, for performance
 * work and for something to look at while building screens.
 *
 * TEMPORARY. Generated titles flatter full-text search and grid layout: they
 * are too uniform. `catalog-service` (module 5) captures a real IGDB fixture
 * and this points at it instead — recorded in `SPEC-map.md`. Until then the
 * generator deliberately produces awkward titles (apostrophes, colons,
 * numerals, long subtitles) so search and layout meet the same edge cases.
 *
 * Deterministic: the same seed gives the same library on every machine, so a
 * timing difference is a real change rather than different data.
 */
export type SeedOptions = {
  entries?: number;
  /** Any string; the same one always produces the same library. */
  seed?: string;
};

export type SeedResult = { games: number; entries: number; tags: number; notes: number };

/** Small, fast, and repeatable: enough for test data, not for anything secret. */
const createRandom = (seed: string): (() => number) => {
  let state = 0x811c9dc5;
  for (const character of seed) {
    state = Math.imul(state ^ character.charCodeAt(0), 0x01000193) >>> 0;
  }

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let drawn = Math.imul(state ^ (state >>> 15), 1 | state);
    drawn = (drawn + Math.imul(drawn ^ (drawn >>> 7), 61 | drawn)) ^ drawn;
    return ((drawn ^ (drawn >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const FIRST = [
  'Shadow',
  'Iron',
  'Crimson',
  'Hollow',
  "Dragon's",
  'Eternal',
  'Silent',
  'Neon',
  "Baldur's",
  'Frozen',
  'Broken',
  'Astral',
];

const SECOND = ['Realm', 'Legacy', 'Protocol', 'Covenant', 'Requiem', 'Ascent', 'Tide', 'Vigil'];

const SUBTITLE = [
  'Director’s Cut',
  'The Long Road Home',
  'Chapters of the Fallen Kingdom',
  'Remastered',
  'Episode II: The Gathering Storm',
  'Definitive Edition',
];

const STATUSES: EntryStatus[] = [
  'backlog',
  'backlog',
  'playing',
  'paused',
  'completed',
  'completed',
  'dropped',
  'wishlist',
];

const TAGS = ['co-op', 'rpg', 'short', 'replay', 'gotta finish', 'couch', 'indie'];

const NOTE_TYPES = ['puzzle', 'secret', 'npc_hint', 'other'] as const;

const pick = <T>(random: () => number, values: readonly T[]): T =>
  values[Math.floor(random() * values.length)] as T;

/** Titles as messy as real ones: apostrophes, colons, numerals, subtitles. */
const titleFor = (random: () => number, index: number): string => {
  const base = `${pick(random, FIRST)} ${pick(random, SECOND)}`;
  const roll = random();

  if (roll < 0.2) return `${base}: ${pick(random, SUBTITLE)}`;
  if (roll < 0.35) return `${base} ${String((index % 4) + 2)}`;
  if (roll < 0.45) return `${base} ${['II', 'III', 'IV', 'VII'][index % 4] ?? 'II'}`;
  return base;
};

const dateFor = (random: () => number): string => {
  const year = 1998 + Math.floor(random() * 28);
  const month = String(1 + Math.floor(random() * 12)).padStart(2, '0');
  const day = String(1 + Math.floor(random() * 28)).padStart(2, '0');
  return `${String(year)}-${month}-${day}`;
};

export const seed = async (
  adapter: StorageAdapter,
  options: SeedOptions = {},
): Promise<SeedResult> => {
  const { entries: wanted = 5_000, seed: seedValue = 'gameplan' } = options;
  const random = createRandom(seedValue);
  const now = '2026-09-20T10:00:00Z';
  const today = '2026-09-20';

  const games: Game[] = Array.from({ length: wanted }, (_, index) => ({
    id: index + 1,
    name: titleFor(random, index),
    slug: `game-${String(index + 1)}`,
    summary: random() < 0.7 ? 'A game about something, described at some length.' : null,
    firstReleaseDate: random() < 0.9 ? dateFor(random) : null,
    coverImageId: random() < 0.95 ? `co${String(index + 1).padStart(5, '0')}` : null,
    genreIds: [],
    platformIds: [],
  }));

  // One transaction for the whole catalog: 5,000 separate ones would dominate
  // the timings this seed exists to measure.
  await upsertGames(adapter, { games, fetchedAt: now });

  let tags = 0;
  let notes = 0;

  for (const game of games) {
    const status = pick(random, STATUSES);
    const entry = createEntry(
      { id: `entry-${String(game.id)}`, gameId: game.id, status, createdAt: now },
      { today },
    );

    await saveLibraryEntry(
      adapter,
      {
        ...entry,
        rating: random() < 0.6 ? Math.floor(random() * 11) : null,
        playtimeMinutes: Math.floor(random() * 6_000),
        favourite: random() < 0.12,
      },
      { updatedAt: `2026-0${String(1 + (game.id % 9))}-15T10:00:00Z` },
    );

    for (const tag of TAGS) {
      if (random() < 0.15) {
        await addEntryTag(
          adapter,
          createEntryTag({ id: tagIdentityKey(entry.id, tag), entryId: entry.id, tag }),
          { createdAt: now },
        );
        tags += 1;
      }
    }

    const noteCount = random() < 0.3 ? 1 + Math.floor(random() * 3) : 0;
    for (let index = 0; index < noteCount; index += 1) {
      await saveNoteItem(
        adapter,
        createNoteItem({
          id: `note-${String(game.id)}-${String(index)}`,
          entryId: entry.id,
          createdAt: now,
          type: pick(random, NOTE_TYPES),
          text: `Remember the thing behind the other thing (${String(index)})`,
          location: random() < 0.6 ? `Chapter ${String(1 + Math.floor(random() * 12))}` : null,
          resolved: random() < 0.4,
        }),
        { updatedAt: now },
      );
      notes += 1;
    }
  }

  return { games: games.length, entries: games.length, tags, notes };
};
