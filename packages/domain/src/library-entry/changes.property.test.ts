import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { entryPatchArb, isoDateArb, libraryEntryArb } from './arbitraries';
import { DomainValidationError } from '../shared/errors';
import { applyEntryChange } from './changes';
import type { EntryChange, EntryPatch } from './changes';
import type { LibraryEntry } from './schema';
import { isWellFormed } from './schema';
import { ENTRY_STATUSES, canTransition } from './status';

const RUNS = { numRuns: 1_000 };

/** A rejection is a valid outcome for a random patch; anything else is a bug. */
const tryApply = (current: LibraryEntry, patch: EntryPatch, today: string): EntryChange | null => {
  try {
    return applyEntryChange(current, patch, { today });
  } catch (error) {
    if (error instanceof DomainValidationError) return null;
    throw error;
  }
};

describe('applyEntryChange properties', () => {
  it('always leaves a well-formed entry that `changed` fully describes', () => {
    fc.assert(
      fc.property(libraryEntryArb, entryPatchArb, isoDateArb, (current, patch, today) => {
        const result = tryApply(current, patch, today);
        if (result === null) return true;

        // If `changed` did not describe the whole edit, sync would send a
        // partial change and devices would drift apart.
        expect(isWellFormed(result.next)).toBe(true);
        expect({ ...current, ...result.changed }).toEqual(result.next);
        return true;
      }),
      RUNS,
    );
  });

  it('is idempotent, even on a later day', () => {
    fc.assert(
      fc.property(libraryEntryArb, entryPatchArb, isoDateArb, (current, patch, today) => {
        const first = tryApply(current, patch, today);
        if (first === null) return true;

        const second = tryApply(first.next, patch, '2035-12-31');
        expect(second?.changed).toEqual({});
        return true;
      }),
      RUNS,
    );
  });

  it('accepts a status change exactly when the table allows it', () => {
    fc.assert(
      fc.property(
        libraryEntryArb,
        fc.constantFrom(...ENTRY_STATUSES),
        isoDateArb,
        (current, status, today) =>
          (tryApply(current, { status }, today) !== null) === canTransition(current.status, status),
      ),
      RUNS,
    );
  });
});
