import { describe, expect, it } from 'vitest';
import { DomainValidationError, throwIfErrors } from './errors';
import type { DomainError } from './errors';

describe('DomainValidationError', () => {
  it('keeps every error and describes each one', () => {
    const errors: DomainError[] = [
      { code: 'invalid_transition', from: 'wishlist', to: 'completed' },
      { code: 'invalid_field', field: 'rating', message: 'Too big.' },
      { code: 'platform_not_available', platformId: 6 },
    ];
    const error = new DomainValidationError(errors);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('DomainValidationError');
    expect(error.errors).toEqual(errors);
    expect(error.messages).toEqual([
      'Cannot change status from wishlist to completed.',
      'rating: Too big.',
      "Platform 6 is not one of the game's platforms.",
    ]);
    expect(error.message).toBe(error.messages.join(' '));
  });

  it('is catchable as an Error', () => {
    expect(() => {
      throw new DomainValidationError([{ code: 'platform_not_available', platformId: 1 }]);
    }).toThrow(DomainValidationError);
  });

  it('refuses an empty error list', () => {
    expect(() => new DomainValidationError([])).toThrow(/at least one error/);
  });
});

describe('throwIfErrors', () => {
  it('does nothing when there are no errors', () => {
    expect(() => throwIfErrors([])).not.toThrow();
  });

  it('throws when there is at least one', () => {
    expect(() => throwIfErrors([{ code: 'platform_not_available', platformId: 6 }])).toThrow(
      DomainValidationError,
    );
  });
});
