export { compareIsoDate, isoDateSchema, isoDateTimeSchema } from './shared/date';
export type { IsoDate, IsoDateTime } from './shared/date';
export { DomainValidationError, throwIfErrors } from './shared/errors';
export type { DomainError } from './shared/errors';
export { trimmedText, zodIssuesToErrors } from './shared/text';

export { applyEntryChange, createEntry, entryPatchSchema } from './library-entry/changes';
export type {
  CreateEntryInput,
  EntryChange,
  EntryContext,
  EntryPatch,
} from './library-entry/changes';
export {
  hoursMinutesToMinutes,
  minutesToHoursMinutes,
  playtimeMinutesSchema,
} from './library-entry/playtime';
export type { HoursMinutes } from './library-entry/playtime';
export { progressSchema } from './library-entry/progress';
export type { Progress } from './library-entry/progress';
export { ratingSchema, ratingToStars, starsToRating } from './library-entry/rating';
export type { Rating } from './library-entry/rating';
export { isWellFormed, libraryEntrySchema } from './library-entry/schema';
export type { LibraryEntry } from './library-entry/schema';
export {
  ENTRY_STATUSES,
  TRANSITIONS,
  canTransition,
  entryStatusSchema,
} from './library-entry/status';
export type { EntryStatus } from './library-entry/status';
