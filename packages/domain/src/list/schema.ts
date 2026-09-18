import { z } from 'zod';
import { isoDateTimeSchema } from '../shared/date';
import { optionalTrimmedText, trimmedText } from '../shared/text';

export const LIST_NAME_MAX_LENGTH = 100;
export const LIST_DESCRIPTION_MAX_LENGTH = 500;

/** A user-made collection, e.g. "Best of 2025" or "Co-op with friends". */
export const listSchema = z
  .object({
    id: z.string().min(1),
    name: trimmedText(1, LIST_NAME_MAX_LENGTH),
    description: optionalTrimmedText(LIST_DESCRIPTION_MAX_LENGTH),
    createdAt: isoDateTimeSchema,
  })
  .strict();

export type List = z.infer<typeof listSchema>;

/**
 * Lists hold catalog games, not library entries, so a list can include games
 * the user doesn't track. A game's status and rating still come from the one
 * library entry, joined on `gameId` (SPEC-domain-model.md §Catalog and library).
 */
export const listItemSchema = z
  .object({
    id: z.string().min(1),
    listId: z.string().min(1),
    gameId: z.number().int().positive(),
    addedAt: isoDateTimeSchema,
  })
  .strict();

export type ListItem = z.infer<typeof listItemSchema>;

/** Oldest first. Manual ordering is deferred; it needs fractional indexing. */
export const compareListItems = (a: ListItem, b: ListItem): number => {
  if (a.addedAt === b.addedAt) return 0;
  return a.addedAt < b.addedAt ? -1 : 1;
};
