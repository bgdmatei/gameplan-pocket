import fc from 'fast-check';
import type { EntryPatch } from './changes';
import type { Progress } from './progress';
import type { LibraryEntry } from './schema';
import { ENTRY_STATUSES } from './status';

/**
 * Test-only generators for property tests. Excluded from coverage in
 * vitest.config.ts — they generate inputs, they aren't rules.
 */

export const isoDateArb: fc.Arbitrary<string> = fc
  .date({
    min: new Date('2000-01-01T00:00:00Z'),
    max: new Date('2035-12-31T00:00:00Z'),
    noInvalidDate: true,
  })
  .map((date) => date.toISOString().slice(0, 10));

export const isoDateTimeArb: fc.Arbitrary<string> = fc
  .date({
    min: new Date('2000-01-01T00:00:00Z'),
    max: new Date('2035-12-31T00:00:00Z'),
    noInvalidDate: true,
  })
  .map((date) => date.toISOString());

export const ratingArb: fc.Arbitrary<number | null> = fc.option(fc.integer({ min: 0, max: 10 }), {
  nil: null,
});

export const progressArb: fc.Arbitrary<Progress> = fc.oneof(
  fc.record({
    type: fc.constant('percentage' as const),
    value: fc.integer({ min: 0, max: 100 }),
  }),
  fc.record({
    type: fc.constant('chapter' as const),
    value: fc.string({ minLength: 1, maxLength: 100 }).filter((text) => text.trim().length > 0),
  }),
  fc
    .record({
      type: fc.constant('achievements' as const),
      earned: fc.integer({ min: 0, max: 200 }),
      total: fc.integer({ min: 1, max: 200 }),
    })
    .filter((progress) => progress.earned <= progress.total),
  fc.record({
    type: fc.constant('freeform' as const),
    value: fc.string({ minLength: 1, maxLength: 200 }).filter((text) => text.trim().length > 0),
  }),
);

/**
 * Generates entries the way they can actually exist on a device, including
 * states only a merge can produce (a dropped entry with a finish date, or a
 * finish date before the start date). Local writes must cope with those.
 */
export const libraryEntryArb: fc.Arbitrary<LibraryEntry> = fc.record({
  id: fc.uuid(),
  gameId: fc.integer({ min: 1, max: 500_000 }),
  status: fc.constantFrom(...ENTRY_STATUSES),
  rating: ratingArb,
  platformId: fc.option(fc.integer({ min: 1, max: 500 }), { nil: null }),
  progress: fc.option(progressArb, { nil: null }),
  playtimeMinutes: fc.integer({ min: 0, max: 1_000_000 }),
  startedOn: fc.option(isoDateArb, { nil: null }),
  finishedOn: fc.option(isoDateArb, { nil: null }),
  favourite: fc.boolean(),
  archived: fc.boolean(),
  createdAt: isoDateTimeArb,
});

export const entryPatchArb: fc.Arbitrary<EntryPatch> = fc.record(
  {
    status: fc.constantFrom(...ENTRY_STATUSES),
    rating: ratingArb,
    platformId: fc.option(fc.integer({ min: 1, max: 500 }), { nil: null }),
    progress: fc.option(progressArb, { nil: null }),
    playtimeMinutes: fc.integer({ min: 0, max: 1_000_000 }),
    favourite: fc.boolean(),
    archived: fc.boolean(),
  },
  { requiredKeys: [] },
);
