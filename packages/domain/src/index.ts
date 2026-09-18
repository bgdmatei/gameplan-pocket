export { compareIsoDate, isoDateSchema, isoDateTimeSchema } from './shared/date';
export type { IsoDate, IsoDateTime } from './shared/date';
export { DomainValidationError, throwIfErrors } from './shared/errors';
export type { DomainError } from './shared/errors';
export { optionalTrimmedText, trimmedText, zodIssuesToErrors } from './shared/text';

export { COVER_SIZES, coverUrl } from './catalog/cover-url';
export type { CoverSize } from './catalog/cover-url';
export { gameSchema, genreSchema, platformSchema } from './catalog/schema';
export type { Game, Genre, Platform } from './catalog/schema';
export { isInLibrary } from './catalog/view';
export type { GameWithEntry } from './catalog/view';
export { applyListChange, createList, createListItem, listPatchSchema } from './list/changes';
export type { ListChange, ListPatch } from './list/changes';
export {
  LIST_DESCRIPTION_MAX_LENGTH,
  LIST_NAME_MAX_LENGTH,
  compareListItems,
  listItemSchema,
  listSchema,
} from './list/schema';
export type { List, ListItem } from './list/schema';
export { applyNoteItemChange, createNoteItem, noteItemPatchSchema } from './note-item/changes';
export type { CreateNoteItemInput, NoteItemChange, NoteItemPatch } from './note-item/changes';
export {
  NOTE_ITEM_TYPES,
  NOTE_LOCATION_MAX_LENGTH,
  NOTE_TEXT_MAX_LENGTH,
  compareNoteItems,
  noteItemSchema,
  noteItemTypeSchema,
} from './note-item/schema';
export type { NoteItem, NoteItemType } from './note-item/schema';
export { noteConflictSchema } from './note-conflict/schema';
export type { NoteConflict } from './note-conflict/schema';

export {
  TAG_MAX_LENGTH,
  createEntryTag,
  displayTag,
  entryTagSchema,
  normaliseTag,
  tagIdentityKey,
} from './entry-tag/tag';
export type { EntryTag } from './entry-tag/tag';
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
