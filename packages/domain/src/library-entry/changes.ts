import type { z } from 'zod';
import type { IsoDate, IsoDateTime } from '../shared/date';
import { definedEntries, diffFields } from '../shared/diff';
import { DomainValidationError, throwIfErrors } from '../shared/errors';
import type { DomainError } from '../shared/errors';
import { zodIssuesToErrors } from '../shared/text';
import { libraryEntrySchema } from './schema';
import type { LibraryEntry } from './schema';
import { canTransition } from './status';
import type { EntryStatus } from './status';

/** Identity fields are set once at creation and never patched. */
const IDENTITY_FIELDS = { id: true, gameId: true, createdAt: true } as const;

/**
 * Dates are system-set: the app derives them from status changes, so the user
 * never types one and a patch can't carry one (SPEC-domain-model.md §Entity
 * model). Listing them here makes `{ finishedOn: ... }` fail as an unknown key.
 */
const DERIVED_FIELDS = { startedOn: true, finishedOn: true } as const;

export const entryPatchSchema = libraryEntrySchema
  .omit({ ...IDENTITY_FIELDS, ...DERIVED_FIELDS })
  .partial()
  .strict();

export type EntryPatch = z.infer<typeof entryPatchSchema>;

export type EntryContext = {
  /** Supplied by the caller; domain never reads a clock. */
  today: IsoDate;
  /** When given, `platformId` must be one of the game's platforms. */
  gamePlatformIds?: readonly number[];
};

/** What actually changed: the patched fields plus any derived date. */
export type EntryChangedFields = EntryPatch & DerivedDates;

export type EntryChange = { next: LibraryEntry; changed: EntryChangedFields };

export type CreateEntryInput = EntryPatch & {
  id: string;
  gameId: number;
  status: EntryStatus;
  createdAt: IsoDateTime;
};

const DEFAULTS = {
  rating: null,
  platformId: null,
  progress: null,
  playtimeMinutes: 0,
  startedOn: null,
  finishedOn: null,
  favourite: false,
  shelved: false,
  archived: false,
} as const;

type DerivedDates = { startedOn?: IsoDate; finishedOn?: IsoDate };

/**
 * Dates a status change fills in. Only ever set when still null, so the first
 * start and first completion survive later transitions, and nothing is ever
 * cleared (SPEC-domain-model.md §Status state machine).
 *
 * Both come from the same `today`, so `finishedOn >= startedOn` holds by
 * construction and needs no cross-field check.
 */
const deriveDates = (status: EntryStatus, merged: LibraryEntry, today: IsoDate): DerivedDates => {
  if (status !== 'playing' && status !== 'completed') return {};

  const derived: DerivedDates = {};
  if (merged.startedOn === null) derived.startedOn = today;
  if (status === 'completed' && merged.finishedOn === null) derived.finishedOn = today;
  return derived;
};

/**
 * The shelf holds only games being played, so a status change away from
 * Playing takes the game off it, the way a change to Playing fills in a start
 * date. Asking to stay shelved in the same patch is refused, not overridden.
 */
const deriveShelf = (supplied: EntryPatch, merged: LibraryEntry): { shelved?: false } =>
  supplied.status !== undefined &&
  supplied.status !== 'playing' &&
  supplied.shelved === undefined &&
  merged.shelved
    ? { shelved: false }
    : {};

const crossFieldErrors = (entry: LibraryEntry, ctx: EntryContext): DomainError[] => {
  const errors: DomainError[] = [];

  if (entry.shelved && entry.status !== 'playing') {
    errors.push({
      code: 'invalid_field',
      field: 'shelved',
      message: 'Only a game you are playing can go on the shelf.',
    });
  }

  if (
    entry.platformId !== null &&
    ctx.gamePlatformIds !== undefined &&
    !ctx.gamePlatformIds.includes(entry.platformId)
  ) {
    errors.push({ code: 'platform_not_available', platformId: entry.platformId });
  }

  return errors;
};

/**
 * Validates a local write and returns the resulting entry plus exactly the
 * fields that changed. `changed` is what `sync-core` emits as a `set` op, so
 * a no-op edit produces `{}` and no op at all.
 *
 * @throws {DomainValidationError} carrying every reason the write was
 * rejected, so a screen can show them all in one toast.
 *
 * Transition rules apply here only. Merges use `isWellFormed` instead, or
 * devices would stop converging (SPEC-domain-model.md §Merge safety).
 */
export const applyEntryChange = (
  current: LibraryEntry,
  patch: EntryPatch,
  ctx: EntryContext,
): EntryChange => {
  const parsed = entryPatchSchema.safeParse(patch);
  if (!parsed.success) throw new DomainValidationError(zodIssuesToErrors(parsed.error.issues));
  const validPatch = parsed.data;

  const supplied = Object.fromEntries(definedEntries(validPatch)) as EntryPatch;
  const errors: DomainError[] = [];

  if (supplied.status !== undefined && !canTransition(current.status, supplied.status)) {
    errors.push({ code: 'invalid_transition', from: current.status, to: supplied.status });
  }

  const merged = { ...current, ...supplied };
  const withDerived = {
    ...merged,
    ...(supplied.status === undefined ? {} : deriveDates(supplied.status, merged, ctx.today)),
    ...deriveShelf(supplied, merged),
  };

  errors.push(...crossFieldErrors(withDerived, ctx));
  throwIfErrors(errors);

  const next = libraryEntrySchema.parse(withDerived);
  // Derived dates are part of the change set even though they aren't patchable:
  // `sync-core` has to send them like any other field.
  const changed = diffFields<LibraryEntry, EntryChangedFields>(current, next, IDENTITY_FIELDS);

  return { next, changed };
};

/** Same rules as a change, applied to a blank entry; any initial status is allowed. */
export const createEntry = (input: CreateEntryInput, ctx: EntryContext): LibraryEntry => {
  const { id, gameId, createdAt, ...patch } = input;
  // The blank entry already carries the requested status, so the transition
  // check sees a same-status no-op and the patch still triggers date derivation.
  const blank = { ...DEFAULTS, id, gameId, createdAt, status: input.status } as LibraryEntry;

  return applyEntryChange(blank, patch, ctx).next;
};
