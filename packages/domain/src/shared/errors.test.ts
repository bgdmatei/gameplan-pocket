import { describe, expect, it } from 'vitest';
import { DomainValidationError } from './errors';

describe('DomainValidationError', () => {
  it('describes every reason, so one toast can show them all', () => {
    const error = new DomainValidationError([
      { code: 'invalid_transition', from: 'wishlist', to: 'completed' },
      { code: 'invalid_field', field: 'rating', message: 'Too big.' },
      { code: 'platform_not_available', platformId: 6 },
    ]);

    expect(error).toBeInstanceOf(Error);
    expect(error.messages).toEqual([
      'Cannot change status from wishlist to completed.',
      'rating: Too big.',
      "Platform 6 is not one of the game's platforms.",
    ]);
    expect(error.message).toBe(error.messages.join(' '));
  });
});
