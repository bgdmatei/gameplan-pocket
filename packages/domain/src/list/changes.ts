import type { z } from 'zod';
import { definedEntries, diffFields } from '../shared/diff';
import { DomainValidationError } from '../shared/errors';
import { zodIssuesToErrors } from '../shared/text';
import { listItemSchema, listSchema } from './schema';
import type { List, ListItem } from './schema';

const IDENTITY_FIELDS = { id: true, createdAt: true } as const;

export const listPatchSchema = listSchema.omit(IDENTITY_FIELDS).partial().strict();

export type ListPatch = z.input<typeof listPatchSchema>;

export type ListChange = { next: List; changed: Partial<List> };

/** @throws {DomainValidationError} when the list can't be created. */
export const createList = (input: {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
}): List => {
  const parsed = listSchema.safeParse({ ...input, description: input.description ?? null });
  if (!parsed.success) throw new DomainValidationError(zodIssuesToErrors(parsed.error.issues));
  return parsed.data;
};

/** @throws {DomainValidationError} listing every reason the edit was rejected. */
export const applyListChange = (current: List, patch: ListPatch): ListChange => {
  const parsedPatch = listPatchSchema.safeParse(patch);
  if (!parsedPatch.success) {
    throw new DomainValidationError(zodIssuesToErrors(parsedPatch.error.issues));
  }

  const supplied = Object.fromEntries(definedEntries(parsedPatch.data));
  const next = listSchema.parse({ ...current, ...supplied });
  return { next, changed: diffFields<List, Partial<List>>(current, next, IDENTITY_FIELDS) };
};

/** @throws {DomainValidationError} when the item can't be created. */
export const createListItem = (input: {
  id: string;
  listId: string;
  gameId: number;
  addedAt: string;
}): ListItem => {
  const parsed = listItemSchema.safeParse(input);
  if (!parsed.success) throw new DomainValidationError(zodIssuesToErrors(parsed.error.issues));
  return parsed.data;
};
