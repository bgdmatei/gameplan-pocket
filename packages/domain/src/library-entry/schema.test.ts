import { describe, expect, it } from 'vitest';
import { isWellFormed, libraryEntrySchema } from './schema';
import type { LibraryEntry } from './schema';

const entry: LibraryEntry = {
  id: '01923f6c-0000-7000-8000-000000000001',
  gameId: 1942,
  status: 'playing',
  rating: null,
  platformId: null,
  progress: null,
  playtimeMinutes: 0,
  startedOn: null,
  finishedOn: null,
  favourite: false,
  createdAt: '2026-09-18T10:00:00Z',
};

describe('libraryEntrySchema', () => {
  it('accepts a minimal entry', () => {
    expect(libraryEntrySchema.safeParse(entry).success).toBe(true);
  });

  it('accepts a fully populated entry', () => {
    const full: LibraryEntry = {
      ...entry,
      status: 'completed',
      rating: 9,
      platformId: 48,
      progress: { type: 'percentage', value: 100 },
      playtimeMinutes: 2_400,
      startedOn: '2026-01-02',
      finishedOn: '2026-03-04',
      favourite: true,
    };
    expect(libraryEntrySchema.safeParse(full).success).toBe(true);
  });

  it.each([
    ['id', ''],
    ['gameId', 0],
    ['gameId', -5],
    ['gameId', 1.5],
    ['status', 'finished'],
    ['rating', 11],
    ['platformId', 0],
    ['playtimeMinutes', -1],
    ['startedOn', '2026-02-30'],
    ['finishedOn', '18-09-2026'],
    ['favourite', 'yes'],
    ['createdAt', '2026-09-18'],
  ])('rejects a bad %s (%s)', (field, value) => {
    expect(libraryEntrySchema.safeParse({ ...entry, [field]: value }).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(libraryEntrySchema.safeParse({ ...entry, review: 'great' }).success).toBe(false);
  });
});

describe('isWellFormed', () => {
  it('accepts a valid entry', () => {
    expect(isWellFormed(entry)).toBe(true);
  });

  it('rejects a malformed entry', () => {
    expect(isWellFormed({ ...entry, status: 'finished' })).toBe(false);
    expect(isWellFormed(null)).toBe(false);
  });

  /**
   * Merge safety: per-field LWW can produce combinations no local write would
   * allow. isWellFormed checks shape only, so merges never reject a state.
   */
  it('accepts merge-produced states that a local write would reject', () => {
    expect(isWellFormed({ ...entry, status: 'dropped', finishedOn: '2026-03-04' })).toBe(true);
    expect(isWellFormed({ ...entry, status: 'wishlist', playtimeMinutes: 900 })).toBe(true);
    expect(isWellFormed({ ...entry, startedOn: '2026-05-05', finishedOn: '2026-01-01' })).toBe(
      true,
    );
  });
});
