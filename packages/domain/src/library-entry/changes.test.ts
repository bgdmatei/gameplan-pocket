import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../shared/errors';
import type { DomainError } from '../shared/errors';
import { applyEntryChange, createEntry } from './changes';
import { isWellFormed } from './schema';
import type { LibraryEntry } from './schema';

const TODAY = '2026-09-18';
const ctx = { today: TODAY };

const base: LibraryEntry = {
  id: '01923f6c-0000-7000-8000-000000000001',
  gameId: 1942,
  status: 'backlog',
  rating: null,
  platformId: null,
  progress: null,
  playtimeMinutes: 0,
  startedOn: null,
  finishedOn: null,
  favourite: false,
  createdAt: '2026-09-01T10:00:00Z',
};

/** Runs `write`, expecting it to be rejected, and returns the reasons. */
const errorsOf = (write: () => unknown): readonly DomainError[] => {
  try {
    write();
  } catch (error) {
    if (error instanceof DomainValidationError) return error.errors;
    throw error;
  }
  throw new Error('expected the write to be rejected');
};

describe('createEntry', () => {
  const input = { id: base.id, gameId: base.gameId, createdAt: base.createdAt };

  it('fills defaults', () => {
    const entry = createEntry({ ...input, status: 'backlog' }, ctx);
    expect(entry).toEqual(base);
    expect(isWellFormed(entry)).toBe(true);
  });

  it.each(['wishlist', 'backlog', 'playing', 'paused', 'completed', 'dropped'] as const)(
    'allows %s as the initial status',
    (status) => {
      expect(() => createEntry({ ...input, status }, ctx)).not.toThrow();
    },
  );

  it('derives startedOn when created as playing', () => {
    const entry = createEntry({ ...input, status: 'playing' }, ctx);
    expect(entry).toMatchObject({ startedOn: TODAY, finishedOn: null });
  });

  it('derives both dates when created as completed', () => {
    const entry = createEntry({ ...input, status: 'completed' }, ctx);
    expect(entry).toMatchObject({ startedOn: TODAY, finishedOn: TODAY });
  });

  it('rejects a date supplied by the caller: dates are system-set', () => {
    expect(() =>
      createEntry({ ...input, status: 'completed', startedOn: '2025-01-01' } as never, ctx),
    ).toThrow(DomainValidationError);
  });

  it('reports invalid fields', () => {
    const errors = errorsOf(() => createEntry({ ...input, status: 'backlog', rating: 11 }, ctx));
    expect(errors[0]).toMatchObject({ code: 'invalid_field', field: 'rating' });
  });

  it('rejects a platform the game is not on', () => {
    const errors = errorsOf(() =>
      createEntry(
        { ...input, status: 'backlog', platformId: 6 },
        { ...ctx, gamePlatformIds: [48, 167] },
      ),
    );
    expect(errors).toEqual([{ code: 'platform_not_available', platformId: 6 }]);
  });
});

describe('applyEntryChange', () => {
  it('returns no changes for a no-op patch', () => {
    const result = applyEntryChange(base, { status: 'backlog', rating: null }, ctx);
    expect(result.changed).toEqual({});
    expect(result.next).toEqual(base);
  });

  it('returns only the fields that differ', () => {
    const result = applyEntryChange(base, { rating: 8, favourite: false }, ctx);
    expect(result.changed).toEqual({ rating: 8 });
    expect(result.next).toEqual({ ...base, rating: 8 });
  });

  it('ignores explicitly undefined fields', () => {
    const result = applyEntryChange(base, { rating: undefined }, ctx);
    expect(result.changed).toEqual({});
  });

  it('treats an equal progress object as unchanged', () => {
    const current = { ...base, progress: { type: 'chapter', value: 'Act II' } } as LibraryEntry;
    const result = applyEntryChange(
      current,
      { progress: { type: 'chapter', value: 'Act II' } },
      ctx,
    );
    expect(result.changed).toEqual({});
  });

  it('detects a changed progress value', () => {
    const current = { ...base, progress: { type: 'chapter', value: 'Act II' } } as LibraryEntry;
    const result = applyEntryChange(current, { progress: { type: 'percentage', value: 40 } }, ctx);
    expect(result.changed).toEqual({ progress: { type: 'percentage', value: 40 } });
  });

  it('derives finishedOn and startedOn on completion', () => {
    const result = applyEntryChange(base, { status: 'completed' }, ctx);
    expect(result.changed).toEqual({ status: 'completed', startedOn: TODAY, finishedOn: TODAY });
  });

  it('keeps an existing startedOn when completing', () => {
    const current = { ...base, status: 'playing', startedOn: '2026-01-05' } as LibraryEntry;
    const result = applyEntryChange(current, { status: 'completed' }, ctx);
    expect(result.changed).toEqual({ status: 'completed', finishedOn: TODAY });
  });

  it.each(['startedOn', 'finishedOn'])('rejects a user-supplied %s', (field) => {
    const errors = errorsOf(() => applyEntryChange(base, { [field]: '2026-08-01' } as never, ctx));
    expect(errors[0]).toMatchObject({ code: 'invalid_field' });
  });

  it('fills both dates when a backlog game is marked completed', () => {
    const result = applyEntryChange(base, { status: 'completed' }, ctx);
    expect(result.next).toMatchObject({ startedOn: TODAY, finishedOn: TODAY });
  });

  it('keeps the first start date when play resumes', () => {
    const playing = applyEntryChange(base, { status: 'playing' }, ctx);
    const paused = applyEntryChange(playing.next, { status: 'paused' }, ctx);
    const resumed = applyEntryChange(paused.next, { status: 'playing' }, { today: '2026-11-30' });
    expect(resumed.changed).toEqual({ status: 'playing' });
    expect(resumed.next.startedOn).toBe(TODAY);
  });

  it('keeps the first completion date', () => {
    const completed = applyEntryChange(base, { status: 'completed' }, ctx);
    const replaying = applyEntryChange(
      completed.next,
      { status: 'playing' },
      { today: '2026-11-30' },
    );
    const again = applyEntryChange(
      replaying.next,
      { status: 'completed' },
      { today: '2026-12-01' },
    );
    expect(again.changed).toEqual({ status: 'completed' });
    expect(again.next.finishedOn).toBe(TODAY);
  });

  it('never clears a date on a later transition', () => {
    const current = {
      ...base,
      status: 'completed',
      startedOn: '2026-01-05',
      finishedOn: '2026-02-05',
    } as LibraryEntry;
    const result = applyEntryChange(current, { status: 'playing' }, ctx);
    expect(result.next).toMatchObject({ startedOn: '2026-01-05', finishedOn: '2026-02-05' });
  });

  it('rejects an invalid transition', () => {
    const current = { ...base, status: 'wishlist' } as LibraryEntry;
    const errors = errorsOf(() => applyEntryChange(current, { status: 'completed' }, ctx));
    expect(errors).toEqual([{ code: 'invalid_transition', from: 'wishlist', to: 'completed' }]);
  });

  it('describes the rejection for a toast', () => {
    const current = { ...base, status: 'wishlist' } as LibraryEntry;
    try {
      applyEntryChange(current, { status: 'completed' }, ctx);
    } catch (error) {
      expect((error as DomainValidationError).message).toBe(
        'Cannot change status from wishlist to completed.',
      );
    }
  });

  it('allows re-setting the same status', () => {
    expect(() => applyEntryChange(base, { status: 'backlog' }, ctx)).not.toThrow();
  });

  it('checks the platform against the game when the list is supplied', () => {
    const errors = errorsOf(() =>
      applyEntryChange(base, { platformId: 6 }, { ...ctx, gamePlatformIds: [48] }),
    );
    expect(errors).toEqual([{ code: 'platform_not_available', platformId: 6 }]);
  });

  it('skips the platform check when no list is supplied', () => {
    expect(() => applyEntryChange(base, { platformId: 6 }, ctx)).not.toThrow();
  });

  it('rejects unknown fields', () => {
    expect(() => applyEntryChange(base, { review: 'great' } as never, ctx)).toThrow(
      DomainValidationError,
    );
  });

  it('rejects patches to identity fields', () => {
    expect(() => applyEntryChange(base, { id: 'other' } as never, ctx)).toThrow(
      DomainValidationError,
    );
    expect(() => applyEntryChange(base, { gameId: 7 } as never, ctx)).toThrow(
      DomainValidationError,
    );
  });

  it('collects every error rather than stopping at the first', () => {
    const current = { ...base, status: 'wishlist' } as LibraryEntry;
    const errors = errorsOf(() =>
      applyEntryChange(
        current,
        { status: 'completed', platformId: 6 },
        {
          ...ctx,
          gamePlatformIds: [48],
        },
      ),
    );
    expect(errors.map((error) => error.code).sort()).toEqual([
      'invalid_transition',
      'platform_not_available',
    ]);
  });

  it('applying changed to current reproduces next', () => {
    const result = applyEntryChange(base, { status: 'playing', rating: 7 }, ctx);
    expect({ ...base, ...result.changed }).toEqual(result.next);
  });

  it('is idempotent: re-applying the same patch changes nothing', () => {
    const patch = { status: 'completed', rating: 9 } as const;
    const first = applyEntryChange(base, patch, ctx);
    const second = applyEntryChange(first.next, patch, ctx);
    expect(second.changed).toEqual({});
  });
});
