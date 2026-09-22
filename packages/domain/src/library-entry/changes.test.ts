import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../shared/errors';
import type { DomainError } from '../shared/errors';
import { applyEntryChange, createEntry } from './changes';
import type { LibraryEntry } from './schema';

const TODAY = '2026-09-18';
const NOW = '2026-09-18T10:00:00Z';
const ctx = { today: TODAY };

const base: LibraryEntry = createEntry(
  { id: 'entry-1', gameId: 1942, status: 'backlog', createdAt: NOW },
  ctx,
);

const rejectionOf = (write: () => unknown): readonly DomainError[] => {
  try {
    write();
  } catch (error) {
    if (error instanceof DomainValidationError) return error.errors;
    throw error;
  }
  throw new Error('expected the write to be rejected');
};

describe('applyEntryChange', () => {
  it('reports only what actually changed, so no-op edits emit no sync op', () => {
    expect(applyEntryChange(base, { status: 'backlog', rating: null }, ctx).changed).toEqual({});
    expect(applyEntryChange(base, { rating: 8, favourite: false }, ctx).changed).toEqual({
      rating: 8,
    });
  });

  it('compares object fields by contents, not identity', () => {
    const current = { ...base, progress: { type: 'chapter', value: 'Act II' } } as LibraryEntry;

    expect(
      applyEntryChange(current, { progress: { type: 'chapter', value: 'Act II' } }, ctx).changed,
    ).toEqual({});
  });

  it('fills in dates on a status change, and never overwrites them later', () => {
    const completed = applyEntryChange(base, { status: 'completed' }, ctx);
    expect(completed.changed).toEqual({
      status: 'completed',
      startedOn: TODAY,
      finishedOn: TODAY,
    });

    const replayed = applyEntryChange(
      completed.next,
      { status: 'playing' },
      { today: '2026-12-01' },
    );
    expect(replayed.next).toMatchObject({ startedOn: TODAY, finishedOn: TODAY });
  });

  it('refuses a date from the caller: dates are system-set', () => {
    expect(() => applyEntryChange(base, { finishedOn: '2026-08-01' } as never, ctx)).toThrow(
      DomainValidationError,
    );
  });

  it('refuses a transition the table forbids, and says which', () => {
    const wishlisted = { ...base, status: 'wishlist' } as LibraryEntry;

    expect(rejectionOf(() => applyEntryChange(wishlisted, { status: 'completed' }, ctx))).toEqual([
      { code: 'invalid_transition', from: 'wishlist', to: 'completed' },
    ]);
  });

  it('collects every reason, so a screen can show them at once', () => {
    const wishlisted = { ...base, status: 'wishlist' } as LibraryEntry;

    const reasons = rejectionOf(() =>
      applyEntryChange(
        wishlisted,
        { status: 'completed', platformId: 6 },
        {
          ...ctx,
          gamePlatformIds: [48],
        },
      ),
    );

    expect(reasons.map((reason) => reason.code).sort()).toEqual([
      'invalid_transition',
      'platform_not_available',
    ]);
  });

  it('refuses unknown and identity fields rather than ignoring them', () => {
    expect(() => applyEntryChange(base, { review: 'great' } as never, ctx)).toThrow();
    expect(() => applyEntryChange(base, { id: 'other' } as never, ctx)).toThrow();
  });
});

describe('createEntry', () => {
  it('starts from any status, filling the dates that status implies', () => {
    const input = { id: 'entry-2', gameId: 7, createdAt: NOW };

    expect(createEntry({ ...input, status: 'playing' }, ctx)).toMatchObject({
      startedOn: TODAY,
      finishedOn: null,
    });
    expect(createEntry({ ...input, status: 'completed' }, ctx)).toMatchObject({
      startedOn: TODAY,
      finishedOn: TODAY,
    });
    expect(createEntry({ ...input, status: 'wishlist' }, ctx)).toMatchObject({
      startedOn: null,
      playtimeMinutes: 0,
      favourite: false,
    });
  });
});
