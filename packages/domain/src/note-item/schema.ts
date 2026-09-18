import { z } from 'zod';
import { isoDateTimeSchema } from '../shared/date';
import { trimmedText } from '../shared/text';

export const NOTE_ITEM_TYPES = ['puzzle', 'secret', 'npc_hint', 'other'] as const;

export const noteItemTypeSchema = z.enum(NOTE_ITEM_TYPES);

export type NoteItemType = z.infer<typeof noteItemTypeSchema>;

export const NOTE_TEXT_MAX_LENGTH = 5_000;
export const NOTE_LOCATION_MAX_LENGTH = 200;

/** Blank means "no location", so it is stored as null rather than an empty string. */
const locationSchema = z
  .union([z.string(), z.null()])
  .transform((value) => (value === null || value.trim().length === 0 ? null : value.trim()))
  .pipe(z.string().min(1).max(NOTE_LOCATION_MAX_LENGTH).nullable());

/**
 * One fact the player wants to remember: a puzzle solution, a secret, an NPC
 * hint, or anything else. Each item is its own synced row, so adding or
 * deleting items on different devices never conflicts (ADR-009).
 */
export const noteItemSchema = z
  .object({
    id: z.string().min(1),
    entryId: z.string().min(1),
    type: noteItemTypeSchema,
    text: trimmedText(1, NOTE_TEXT_MAX_LENGTH),
    location: locationSchema,
    resolved: z.boolean(),
    createdAt: isoDateTimeSchema,
  })
  .strict();

export type NoteItem = z.infer<typeof noteItemSchema>;

/**
 * Reading order: by location, then oldest first. Items with no location go
 * last, so a chapter list reads top to bottom and loose notes sit at the end.
 */
export const compareNoteItems = (a: NoteItem, b: NoteItem): number => {
  if (a.location !== b.location) {
    if (a.location === null) return 1;
    if (b.location === null) return -1;
    return a.location < b.location ? -1 : 1;
  }
  if (a.createdAt === b.createdAt) return 0;
  return a.createdAt < b.createdAt ? -1 : 1;
};
