import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../shared/errors';
import { createEntryTag, displayTag, entryTagSchema, normaliseTag, tagIdentityKey } from './tag';

const ENTRY_ID = '01923f6c-0000-7000-8000-000000000001';

describe('normaliseTag', () => {
  it.each([
    ['co-op', 'co-op'],
    ['  co-op  ', 'co-op'],
    ['Co-Op', 'co-op'],
    ['CO-OP', 'co-op'],
    ['best   of    2025', 'best of 2025'],
    ['best\tof\n2025', 'best of 2025'],
  ])('normalises %o to %o', (input, expected) => {
    expect(normaliseTag(input)).toBe(expected);
  });

  it('is idempotent', () => {
    const once = normaliseTag('  Best   Of 2025 ');
    expect(normaliseTag(once)).toBe(once);
  });

  it.each(['', '   ', '\t\n', 'a'.repeat(33)])('throws for %o', (input) => {
    expect(() => normaliseTag(input)).toThrow(DomainValidationError);
  });

  it('accepts the longest allowed tag', () => {
    expect(normaliseTag('a'.repeat(32))).toHaveLength(32);
  });

  it('measures length after normalising', () => {
    expect(normaliseTag(`  ${'a'.repeat(32)}  `)).toHaveLength(32);
  });
});

describe('displayTag', () => {
  it.each([
    ['co-op', 'Co-op'],
    ['best of 2025', 'Best of 2025'],
    ['rpg', 'Rpg'],
  ])('capitalises %o as %o', (input, expected) => {
    expect(displayTag(input)).toBe(expected);
  });

  it('leaves a non-letter first character alone', () => {
    expect(displayTag('2025 goty')).toBe('2025 goty');
  });

  it('capitalises accented letters', () => {
    expect(displayTag('über')).toBe('Über');
    expect(displayTag('ñandu')).toBe('Ñandu');
  });

  it('leaves a letter whose uppercase form is longer: ß would become SS', () => {
    expect(displayTag('ßeta')).toBe('ßeta');
  });

  it('round-trips back to the stored form', () => {
    for (const tag of ['co-op', 'best of 2025', '2025 goty', 'ßeta', 'über']) {
      expect(normaliseTag(displayTag(tag))).toBe(tag);
    }
  });
});

describe('tagIdentityKey', () => {
  it('is the same for every casing and spacing of a tag', () => {
    const expected = tagIdentityKey(ENTRY_ID, 'co-op');
    expect(tagIdentityKey(ENTRY_ID, 'Co-Op')).toBe(expected);
    expect(tagIdentityKey(ENTRY_ID, '  CO-OP ')).toBe(expected);
  });

  it('differs per entry and per tag', () => {
    expect(tagIdentityKey(ENTRY_ID, 'co-op')).not.toBe(tagIdentityKey('other', 'co-op'));
    expect(tagIdentityKey(ENTRY_ID, 'co-op')).not.toBe(tagIdentityKey(ENTRY_ID, 'rpg'));
  });

  it('cannot confuse where the entry id ends and the tag begins', () => {
    // A plain separator would make ("ab", "c") and ("a", "bc") collide once a
    // tag contains that separator; the length prefix cannot.
    expect(tagIdentityKey('ab', 'c')).not.toBe(tagIdentityKey('a', 'bc'));
    expect(tagIdentityKey('a', 'b:c')).not.toBe(tagIdentityKey('a:b', 'c'));
  });

  it('is plain printable text, so it is safe to store and log', () => {
    const key = tagIdentityKey('entry-1', 'co-op');

    expect(key).toBe('7:entry-1:co-op');
    // eslint-disable-next-line no-control-regex -- the point of the assertion
    expect(/[\u0000-\u001f]/.test(key)).toBe(false);
  });
});

describe('entryTagSchema', () => {
  it('accepts a normalised tag row', () => {
    expect(entryTagSchema.safeParse({ id: 'tag-1', entryId: ENTRY_ID, tag: 'co-op' }).success).toBe(
      true,
    );
  });

  it.each([
    { id: '', entryId: ENTRY_ID, tag: 'co-op' },
    { id: 'tag-1', entryId: '', tag: 'co-op' },
    { id: 'tag-1', entryId: ENTRY_ID, tag: '' },
    { id: 'tag-1', entryId: ENTRY_ID, tag: 'Co-Op' },
    { id: 'tag-1', entryId: ENTRY_ID, tag: ' co-op' },
    { id: 'tag-1', entryId: ENTRY_ID, tag: 'a'.repeat(33) },
  ])('rejects %o', (value) => {
    expect(entryTagSchema.safeParse(value).success).toBe(false);
  });
});

describe('createEntryTag', () => {
  it('normalises the tag it stores', () => {
    expect(createEntryTag({ id: 'tag-1', entryId: ENTRY_ID, tag: '  Co-Op ' })).toEqual({
      id: 'tag-1',
      entryId: ENTRY_ID,
      tag: 'co-op',
    });
  });

  it('throws for an unusable tag', () => {
    expect(() => createEntryTag({ id: 'tag-1', entryId: ENTRY_ID, tag: '   ' })).toThrow(
      DomainValidationError,
    );
  });
});
