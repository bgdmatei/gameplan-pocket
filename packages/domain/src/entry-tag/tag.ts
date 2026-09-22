import { z } from 'zod';
import { DomainValidationError } from '../shared/errors';

export const TAG_MAX_LENGTH = 32;

/** Stored form: trimmed, inner whitespace collapsed, lowercased. */
const normalisedTagSchema = z
  .string()
  .min(1)
  .max(TAG_MAX_LENGTH)
  .refine((tag) => tag === tag.trim().replace(/\s+/g, ' ').toLowerCase(), {
    message: 'Tag must be stored in its normalised form.',
  });

/**
 * Tags are stored lowercase so `Co-op`, `co-op` and `CO-OP` are one tag, and
 * shown through `displayTag` (SPEC-domain-model.md §EntryTag).
 *
 * @throws {DomainValidationError} when nothing usable is left, or it is too long.
 */
export const normaliseTag = (raw: string): string => {
  const tag = raw.trim().replace(/\s+/g, ' ').toLowerCase();

  if (tag.length === 0 || tag.length > TAG_MAX_LENGTH) {
    throw new DomainValidationError([
      {
        code: 'invalid_field',
        field: 'tag',
        message: `Tag must be between 1 and ${TAG_MAX_LENGTH} characters.`,
      },
    ]);
  }

  return tag;
};

/**
 * Display form: `co-op` reads as `Co-op`. Typed casing is never stored.
 *
 * A first character whose uppercase form is longer is left alone: German `ß`
 * uppercases to `SS`, which would display `ßeta` as `SSeta` and no longer
 * normalise back to the stored tag.
 */
export const displayTag = (tag: string): string => {
  const first = tag.charAt(0);
  const upper = first.toUpperCase();
  return (upper.length === first.length ? upper : first) + tag.slice(1);
};

/**
 * Identity of a tag on an entry. `sync-core` hashes this into a deterministic
 * id, so the same tag added offline on two devices becomes one row instead of
 * two.
 *
 * The entry id is length-prefixed rather than separated by a delimiter, so
 * ("ab", "c") and ("a", "bc") cannot produce the same key whatever characters a
 * tag contains. The key is plain printable text and safe to store or log: an
 * earlier version separated the parts with a NUL character, which SQLite
 * silently truncates a value at.
 */
export const tagIdentityKey = (entryId: string, tag: string): string =>
  `${String(entryId.length)}:${entryId}:${normaliseTag(tag)}`;

export const entryTagSchema = z
  .object({
    id: z.string().min(1),
    entryId: z.string().min(1),
    tag: normalisedTagSchema,
  })
  .strict();

export type EntryTag = z.infer<typeof entryTagSchema>;

/** @throws {DomainValidationError} when the tag is unusable. */
export const createEntryTag = (input: { id: string; entryId: string; tag: string }): EntryTag =>
  entryTagSchema.parse({ ...input, tag: normaliseTag(input.tag) });
