import { describe, expect, it } from 'vitest';
import { entryId, tagId } from './ids';

describe('deterministic ids', () => {
  // Pinned: if this changes, every device would give existing entries new ids
  // and stop agreeing which row is which.
  it('derives an entry id from the game alone, and never changes it', () => {
    expect(entryId(1942)).toBe('9b385207-54aa-5778-81a4-815107b15eb0');
    expect(entryId(1943)).not.toBe(entryId(1942));
  });

  it('gives the same tag on the same entry one id, however it was typed', () => {
    const entry = entryId(1942);

    expect(tagId(entry, '  Co-op ')).toBe(tagId(entry, 'co-op'));
    expect(tagId(entry, 'co-op')).not.toBe(tagId(entryId(1943), 'co-op'));
  });
});
