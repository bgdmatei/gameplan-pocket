import { describe, expect, it } from 'vitest';
import * as domain from './index';

/**
 * Guards the package's public surface: every name the spec's success criteria
 * list must be reachable from the entry point, and nothing should leak by
 * accident. Types aren't checked here — typecheck covers those.
 */
const EXPECTED_EXPORTS = [
  // shared
  'DomainValidationError',
  'throwIfErrors',
  'compareIsoDate',
  'isoDateSchema',
  'isoDateTimeSchema',
  'optionalTrimmedText',
  'trimmedText',
  'zodIssuesToErrors',
  // catalog
  'COVER_SIZES',
  'coverUrl',
  'gameSchema',
  'genreSchema',
  'platformSchema',
  'isInLibrary',
  // library entry
  'ENTRY_STATUSES',
  'TRANSITIONS',
  'canTransition',
  'entryStatusSchema',
  'libraryEntrySchema',
  'isWellFormed',
  'applyEntryChange',
  'createEntry',
  'entryPatchSchema',
  'progressSchema',
  'ratingSchema',
  'ratingToStars',
  'starsToRating',
  'playtimeMinutesSchema',
  'hoursMinutesToMinutes',
  'minutesToHoursMinutes',
  // tags
  'TAG_MAX_LENGTH',
  'createEntryTag',
  'displayTag',
  'entryTagSchema',
  'normaliseTag',
  'tagIdentityKey',
  // notes
  'NOTE_ITEM_TYPES',
  'NOTE_LOCATION_MAX_LENGTH',
  'NOTE_TEXT_MAX_LENGTH',
  'compareNoteItems',
  'noteItemSchema',
  'noteItemTypeSchema',
  'applyNoteItemChange',
  'createNoteItem',
  'noteItemPatchSchema',
  'noteConflictSchema',
  // lists
  'LIST_NAME_MAX_LENGTH',
  'LIST_DESCRIPTION_MAX_LENGTH',
  'compareListItems',
  'listSchema',
  'listItemSchema',
  'applyListChange',
  'createList',
  'createListItem',
  'listPatchSchema',
] as const;

describe('public API', () => {
  it('exports exactly the documented surface, no more and no less', () => {
    expect(Object.keys(domain).sort()).toEqual([...EXPECTED_EXPORTS].sort());
  });
});
