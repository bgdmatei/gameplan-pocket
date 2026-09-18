import type { EntryStatus } from '../library-entry/status';

/** Machine-readable reason a write was rejected. */
export type DomainError =
  | { code: 'invalid_transition'; from: EntryStatus; to: EntryStatus }
  | { code: 'invalid_field'; field: string; message: string }
  | { code: 'platform_not_available'; platformId: number };

const describe = (error: DomainError): string => {
  switch (error.code) {
    case 'invalid_transition':
      return `Cannot change status from ${error.from} to ${error.to}.`;
    case 'invalid_field':
      return `${error.field}: ${error.message}`;
    case 'platform_not_available':
      return `Platform ${error.platformId} is not one of the game's platforms.`;
  }
};

/**
 * Thrown by every write rule when the change is rejected. Carries *all*
 * reasons, not just the first, so a screen can show them in one toast.
 *
 * ```ts
 * try {
 *   const { next, changed } = applyEntryChange(entry, patch, { today });
 * } catch (error) {
 *   if (error instanceof DomainValidationError) toast(error.message);
 * }
 * ```
 */
export class DomainValidationError extends Error {
  readonly errors: readonly DomainError[];

  constructor(errors: readonly DomainError[]) {
    if (errors.length === 0) {
      throw new Error('DomainValidationError needs at least one error.');
    }
    super(errors.map(describe).join(' '));
    this.name = 'DomainValidationError';
    this.errors = errors;
  }

  /** Every reason as a display string, for listing them separately. */
  get messages(): string[] {
    return this.errors.map(describe);
  }
}

/** Throws when anything was rejected; a no-op when the list is empty. */
export const throwIfErrors = (errors: readonly DomainError[]): void => {
  if (errors.length > 0) throw new DomainValidationError(errors);
};
