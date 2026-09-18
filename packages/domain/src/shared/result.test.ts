import { describe, expect, it } from 'vitest';
import { fail, isOk, ok } from './result';
import type { DomainError } from './result';

describe('ok', () => {
  it('wraps a value', () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });
});

describe('fail', () => {
  it('wraps a single error as a list', () => {
    const error: DomainError = { code: 'invalid_field', field: 'rating', message: 'too big' };
    expect(fail(error)).toEqual({ ok: false, errors: [error] });
  });

  it('keeps a list of errors as-is', () => {
    const errors: DomainError[] = [
      { code: 'invalid_transition', from: 'wishlist', to: 'completed' },
      { code: 'platform_not_available', platformId: 48 },
    ];
    expect(fail(errors)).toEqual({ ok: false, errors });
  });

  it('rejects an empty error list', () => {
    expect(() => fail([])).toThrow(/at least one error/);
  });
});

describe('isOk', () => {
  it('narrows success and failure', () => {
    const success = ok('a');
    const failure = fail({ code: 'invalid_field', field: 'x', message: 'y' });
    expect(isOk(success)).toBe(true);
    expect(isOk(failure)).toBe(false);
    if (isOk(success)) expect(success.value).toBe('a');
  });
});
