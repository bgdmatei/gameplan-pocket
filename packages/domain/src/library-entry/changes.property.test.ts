import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { entryPatchArb, isoDateArb, libraryEntryArb } from './arbitraries';
import { DomainValidationError } from '../shared/errors';
import { applyEntryChange } from './changes';
import type { EntryChange, EntryPatch } from './changes';
import { ratingToStars, starsToRating } from './rating';
import { isWellFormed } from './schema';
import { ENTRY_STATUSES, canTransition } from './status';
import type { EntryStatus } from './status';

const RUNS = { numRuns: 1_000 };

/**
 * Write rules throw when a change is rejected, which is a valid outcome for a
 * random patch. `null` means "rejected", and anything other than a
 * DomainValidationError is a real bug and still escapes.
 */
const tryApply = (
  current: Parameters<typeof applyEntryChange>[0],
  patch: EntryPatch,
  today: string,
): EntryChange | null => {
  try {
    return applyEntryChange(current, patch, { today });
  } catch (error) {
    if (error instanceof DomainValidationError) return null;
    throw error;
  }
};

describe('applyEntryChange properties', () => {
  it('never produces a malformed entry', () => {
    fc.assert(
      fc.property(libraryEntryArb, entryPatchArb, isoDateArb, (current, patch, today) => {
        const result = tryApply(current, patch, today);
        return result === null || isWellFormed(result.next);
      }),
      RUNS,
    );
  });

  it('applying `changed` to `current` reproduces `next`', () => {
    fc.assert(
      fc.property(libraryEntryArb, entryPatchArb, isoDateArb, (current, patch, today) => {
        const result = tryApply(current, patch, today);
        if (result === null) return true;
        expect({ ...current, ...result.changed }).toEqual(result.next);
        return true;
      }),
      RUNS,
    );
  });

  it('is idempotent: re-applying the same patch changes nothing', () => {
    fc.assert(
      fc.property(libraryEntryArb, entryPatchArb, isoDateArb, (current, patch, today) => {
        const first = tryApply(current, patch, today);
        if (first === null) return true;

        // A later day must not change the outcome either: dates are only
        // filled when null, so the second pass has nothing left to derive.
        const second = tryApply(first.next, patch, '2035-12-31');
        expect(second).not.toBeNull();
        expect(second?.changed).toEqual({});
        return true;
      }),
      RUNS,
    );
  });

  it('only ever reports fields that really differ', () => {
    fc.assert(
      fc.property(libraryEntryArb, entryPatchArb, isoDateArb, (current, patch, today) => {
        const result = tryApply(current, patch, today);
        if (result === null) return true;

        for (const [field, value] of Object.entries(result.changed)) {
          expect(value).not.toEqual((current as Record<string, unknown>)[field]);
        }
        return true;
      }),
      RUNS,
    );
  });

  it('never clears a date that was already set', () => {
    fc.assert(
      fc.property(libraryEntryArb, entryPatchArb, isoDateArb, (current, patch, today) => {
        const result = tryApply(current, patch, today);
        if (result === null) return true;

        const { next } = result;
        if (current.startedOn !== null) expect(next.startedOn).toBe(current.startedOn);
        if (current.finishedOn !== null) expect(next.finishedOn).toBe(current.finishedOn);
        return true;
      }),
      RUNS,
    );
  });

  it('rejects a status change exactly when the table forbids it', () => {
    fc.assert(
      fc.property(
        libraryEntryArb,
        fc.constantFrom(...ENTRY_STATUSES),
        isoDateArb,
        (current, status, today) => {
          const accepted = tryApply(current, { status }, today) !== null;
          return accepted === canTransition(current.status, status);
        },
      ),
      RUNS,
    );
  });
});

describe('status graph', () => {
  /** Shortest number of valid transitions from `from` to `to`. */
  const distance = (from: EntryStatus, to: EntryStatus): number => {
    const seen = new Map<EntryStatus, number>([[from, 0]]);
    const queue: EntryStatus[] = [from];

    for (const status of queue) {
      if (status === to) break;
      for (const candidate of ENTRY_STATUSES) {
        if (!seen.has(candidate) && canTransition(status, candidate)) {
          seen.set(candidate, (seen.get(status) ?? 0) + 1);
          queue.push(candidate);
        }
      }
    }

    return seen.get(to) ?? Infinity;
  };

  it('reaches every status from every status in at most 3 transitions', () => {
    for (const from of ENTRY_STATUSES) {
      for (const to of ENTRY_STATUSES) {
        expect(distance(from, to), `${from} -> ${to}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('has no merge-produced dead end: every status can still be left', () => {
    for (const status of ENTRY_STATUSES) {
      const exits = ENTRY_STATUSES.filter((to) => to !== status && canTransition(status, to));
      expect(exits.length, `${status} is a dead end`).toBeGreaterThan(0);
    }
  });
});

describe('rating conversion properties', () => {
  it('round-trips every rating through stars', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10 }), (rating) => {
        expect(starsToRating(ratingToStars(rating))).toBe(rating);
        return true;
      }),
      RUNS,
    );
  });

  it('only accepts stars between 0 and 5 in half steps', () => {
    fc.assert(
      fc.property(fc.double({ min: -10, max: 10, noNaN: true }), (stars) => {
        const expected = Number.isInteger(stars * 2) && stars >= 0 && stars <= 5;
        try {
          starsToRating(stars);
          return expected;
        } catch (error) {
          return !expected && error instanceof DomainValidationError;
        }
      }),
      RUNS,
    );
  });
});
