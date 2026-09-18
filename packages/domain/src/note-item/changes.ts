import type { z } from 'zod';
import { definedEntries, diffFields } from '../shared/diff';
import { DomainValidationError } from '../shared/errors';
import { zodIssuesToErrors } from '../shared/text';
import { noteItemSchema } from './schema';
import type { NoteItem, NoteItemType } from './schema';

/** Set once when the item is written; the rest of the fields can be edited. */
const IDENTITY_FIELDS = { id: true, entryId: true, createdAt: true } as const;

export const noteItemPatchSchema = noteItemSchema.omit(IDENTITY_FIELDS).partial().strict();

export type NoteItemPatch = z.input<typeof noteItemPatchSchema>;

export type NoteItemChange = { next: NoteItem; changed: Partial<NoteItem> };

export type CreateNoteItemInput = {
  id: string;
  entryId: string;
  createdAt: string;
  type: NoteItemType;
  text: string;
  location?: string | null;
  resolved?: boolean;
};

/**
 * Applies an edit to one note item and reports exactly what changed. Text and
 * location are compared after trimming, so re-saving an unchanged note emits
 * nothing.
 *
 * Items are separate rows, so adds and deletes on different devices never
 * collide; only concurrent edits to the same item's text conflict, which
 * `notes-conflicts` handles (ADR-009).
 *
 * @throws {DomainValidationError} listing every reason the edit was rejected.
 */
export const applyNoteItemChange = (current: NoteItem, patch: NoteItemPatch): NoteItemChange => {
  const parsedPatch = noteItemPatchSchema.safeParse(patch);
  if (!parsedPatch.success) {
    throw new DomainValidationError(zodIssuesToErrors(parsedPatch.error.issues));
  }

  // The patch schema validated and normalised every supplied field (trimming
  // text, blank location to null), and `current` is already valid, so the
  // merged item cannot fail: parse here only applies the object-level checks.
  const supplied = Object.fromEntries(definedEntries(parsedPatch.data));
  const next = noteItemSchema.parse({ ...current, ...supplied });
  return { next, changed: diffFields<NoteItem, Partial<NoteItem>>(current, next, IDENTITY_FIELDS) };
};

/** @throws {DomainValidationError} when the item is unusable. */
export const createNoteItem = (input: CreateNoteItemInput): NoteItem => {
  const candidate = {
    id: input.id,
    entryId: input.entryId,
    createdAt: input.createdAt,
    type: input.type,
    text: input.text,
    location: input.location ?? null,
    resolved: input.resolved ?? false,
  };

  const parsed = noteItemSchema.safeParse(candidate);
  if (!parsed.success) throw new DomainValidationError(zodIssuesToErrors(parsed.error.issues));
  return parsed.data;
};
