import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../shared/errors';
import { createEntryTag, displayTag, normaliseTag, tagIdentityKey } from './tag';

describe('normaliseTag', () => {
  it('folds casing and spacing, so one tag cannot become several', () => {
    expect(normaliseTag('  Co-Op  ')).toBe('co-op');
    expect(normaliseTag('best   of    2025')).toBe('best of 2025');
  });

  it('refuses what leaves nothing usable', () => {
    expect(() => normaliseTag('   ')).toThrow(DomainValidationError);
    expect(() => normaliseTag('a'.repeat(33))).toThrow(DomainValidationError);
  });
});

describe('displayTag', () => {
  it('capitalises for display without changing what is stored', () => {
    expect(displayTag('co-op')).toBe('Co-op');
    expect(displayTag('über')).toBe('Über');
    expect(displayTag('2025 goty')).toBe('2025 goty');
  });

  /** Bug: ß uppercases to SS, so the displayed tag no longer matched the stored one. */
  it('leaves a letter whose uppercase form is longer', () => {
    expect(displayTag('ßeta')).toBe('ßeta');
    expect(normaliseTag(displayTag('ßeta'))).toBe('ßeta');
  });
});

describe('tagIdentityKey', () => {
  it('is the same however the tag was typed, so two devices agree', () => {
    const expected = tagIdentityKey('entry-1', 'co-op');
    expect(tagIdentityKey('entry-1', '  CO-OP ')).toBe(expected);
  });

  /**
   * Bug: a NUL separator was silently truncated by SQLite. The length prefix
   * also means no tag content can make two different pairs collide.
   */
  it('is printable, and cannot confuse the entry id with the tag', () => {
    expect(tagIdentityKey('entry-1', 'co-op')).toBe('7:entry-1:co-op');
    expect(tagIdentityKey('a', 'b:c')).not.toBe(tagIdentityKey('a:b', 'c'));
  });
});

describe('createEntryTag', () => {
  it('stores the normalised form', () => {
    expect(createEntryTag({ id: 'tag-1', entryId: 'entry-1', tag: '  Co-Op ' }).tag).toBe('co-op');
  });
});
