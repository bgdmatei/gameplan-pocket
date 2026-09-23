import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { TAG_MAX_LENGTH, displayTag, normaliseTag } from './tag';

/** ASCII: the app is English-only, and case folding is not universal. */
const usableTag = fc.string({ maxLength: 40 }).filter((raw) => {
  const normalised = raw.trim().replace(/\s+/g, ' ').toLowerCase();
  return normalised.length > 0 && normalised.length <= TAG_MAX_LENGTH;
});

describe('tag normalisation properties', () => {
  it('is stable, and survives a trip through the display form', () => {
    fc.assert(
      fc.property(usableTag, (raw) => {
        const tag = normaliseTag(raw);
        expect(normaliseTag(tag)).toBe(tag);
        expect(normaliseTag(displayTag(tag))).toBe(tag);
        return true;
      }),
      { numRuns: 500 },
    );
  });
});
