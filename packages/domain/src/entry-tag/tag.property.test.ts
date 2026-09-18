import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../shared/errors';
import { TAG_MAX_LENGTH, displayTag, normaliseTag, tagIdentityKey } from './tag';

const RUNS = { numRuns: 1_000 };

/**
 * Raw user input: ASCII, including whitespace-only and over-long strings.
 *
 * Deliberately ASCII: the app is English-only, and the "uppercase then
 * normalise gives the same tag" property below is not true for every script
 * (German ß uppercases to SS), which made this suite fail intermittently.
 * The ß behaviour itself is pinned by a unit test in tag.test.ts.
 */
const rawTagArb = fc.string({ maxLength: 40 });

/** Input that survives normalisation. */
const usableTagArb = rawTagArb.filter((raw) => {
  const normalised = raw.trim().replace(/\s+/g, ' ').toLowerCase();
  return normalised.length > 0 && normalised.length <= TAG_MAX_LENGTH;
});

describe('normaliseTag properties', () => {
  it('is idempotent', () => {
    fc.assert(
      fc.property(usableTagArb, (raw) => {
        const once = normaliseTag(raw);
        expect(normaliseTag(once)).toBe(once);
        return true;
      }),
      RUNS,
    );
  });

  it('always returns a stored form: trimmed, single-spaced, lowercase', () => {
    fc.assert(
      fc.property(usableTagArb, (raw) => {
        const tag = normaliseTag(raw);
        return (
          tag === tag.trim() &&
          !tag.includes('  ') &&
          tag === tag.toLowerCase() &&
          tag.length >= 1 &&
          tag.length <= TAG_MAX_LENGTH
        );
      }),
      RUNS,
    );
  });

  it('throws exactly when nothing usable is left', () => {
    fc.assert(
      fc.property(rawTagArb, (raw) => {
        const normalised = raw.trim().replace(/\s+/g, ' ').toLowerCase();
        const usable = normalised.length > 0 && normalised.length <= TAG_MAX_LENGTH;
        try {
          normaliseTag(raw);
          return usable;
        } catch (error) {
          return !usable && error instanceof DomainValidationError;
        }
      }),
      RUNS,
    );
  });
});

describe('displayTag properties', () => {
  it('normalising a displayed tag returns the stored tag', () => {
    fc.assert(
      fc.property(usableTagArb, (raw) => {
        const tag = normaliseTag(raw);
        expect(normaliseTag(displayTag(tag))).toBe(tag);
        return true;
      }),
      RUNS,
    );
  });
});

describe('tagIdentityKey properties', () => {
  it('ignores casing and spacing, so duplicates collapse to one row', () => {
    fc.assert(
      fc.property(usableTagArb, fc.uuid(), (raw, entryId) => {
        const shouted = `  ${raw.toUpperCase()}  `;
        // Only compare when the noisy variant is still usable.
        const normalised = shouted.trim().replace(/\s+/g, ' ').toLowerCase();
        if (normalised.length === 0 || normalised.length > TAG_MAX_LENGTH) return true;

        expect(tagIdentityKey(entryId, shouted)).toBe(tagIdentityKey(entryId, raw));
        return true;
      }),
      RUNS,
    );
  });

  it('distinguishes different entries and different tags', () => {
    fc.assert(
      fc.property(usableTagArb, usableTagArb, fc.uuid(), fc.uuid(), (a, b, entryA, entryB) => {
        const sameTag = normaliseTag(a) === normaliseTag(b);
        const sameEntry = entryA === entryB;
        const sameKey = tagIdentityKey(entryA, a) === tagIdentityKey(entryB, b);
        return sameKey === (sameTag && sameEntry);
      }),
      RUNS,
    );
  });
});
