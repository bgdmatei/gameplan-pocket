import type { EntryStatus } from '../library-entry/status';

/**
 * Every write rule reports user errors through `Result`; it never throws for
 * them. Throwing is reserved for programmer errors (see `fail`).
 */
export type DomainError =
  | { code: 'invalid_transition'; from: EntryStatus; to: EntryStatus }
  | { code: 'invalid_field'; field: string; message: string }
  | { code: 'platform_not_available'; platformId: number };

export type Result<T> = { ok: true; value: T } | { ok: false; errors: DomainError[] };

export const ok = <T>(value: T): Result<T> => {
  return { ok: true, value };
};

export const fail = <T>(errors: DomainError | DomainError[]): Result<T> => {
  const list = Array.isArray(errors) ? errors : [errors];
  if (list.length === 0) {
    throw new Error('fail() needs at least one error; use ok() for success.');
  }
  return { ok: false, errors: list };
};

export const isOk = <T>(result: Result<T>): result is { ok: true; value: T } => {
  return result.ok;
};
