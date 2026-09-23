import { createEntry, createEntryTag, createNoteItem, tagIdentityKey } from '@gameplan/domain';
import type { EntryStatus, Game, Genre, Platform } from '@gameplan/domain';
import type { StorageAdapter } from '../adapter';
import { addEntryTag } from '../repositories/entry-tags';
import { upsertGames } from '../repositories/games';
import { saveLibraryEntry } from '../repositories/library-entries';
import { saveNoteItem } from '../repositories/note-items';

/**
 * Fills a database with a library the size of a heavy user's, for performance
 * work and for something to look at while building screens.
 *
 * The games are real: `catalog` is normally `fixtures/catalog.json`, 1,000 of
 * IGDB's most-rated games with their genres and platforms, captured by
 * `pnpm --filter api capture:games`. A
 * library of 5,000 needs 5,000 games, so the catalog is cycled: later rounds
 * reuse the titles under new ids. Real titles keep search and layout honest;
 * generated ones were too uniform and flattered both.
 *
 * Deterministic: the same catalog and seed give the same library on every
 * machine, so a timing difference is a real change rather than different data.
 */
export type SeedOptions = {
  catalog: { games: readonly Game[]; genres: readonly Genre[]; platforms: readonly Platform[] };
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

/** Keeps ids of repeated titles clear of real IGDB ids, which stay below this. */
const CYCLE_OFFSET = 10_000_000;

export const seed = async (adapter: StorageAdapter, options: SeedOptions): Promise<SeedResult> => {
  const { catalog, entries: wanted = 5_000, seed: seedValue = 'gameplan' } = options;
  const { games: real } = catalog;
  if (real.length === 0) throw new Error('The seed needs at least one game to cycle.');

  const random = createRandom(seedValue);
  const now = '2026-09-20T10:00:00Z';
  const today = '2026-09-20';

  const games: Game[] = Array.from({ length: wanted }, (_, index) => {
    const game = real[index % real.length] as Game;
    const round = Math.floor(index / real.length);
    return round === 0
      ? game
      : { ...game, id: game.id + round * CYCLE_OFFSET, slug: `${game.slug}-${String(round)}` };
  });

  // One transaction for the whole catalog: 5,000 separate ones would dominate
  // the timings this seed exists to measure.
  await upsertGames(adapter, {
    games,
    genres: [...catalog.genres],
    platforms: [...catalog.platforms],
    fetchedAt: now,
  });

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
