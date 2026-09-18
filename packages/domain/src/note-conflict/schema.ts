import { z } from 'zod';
import { isoDateTimeSchema } from '../shared/date';
import { trimmedText } from '../shared/text';
import { NOTE_TEXT_MAX_LENGTH } from '../note-item/schema';

/**
 * The losing side of a concurrent edit to one note item's text, kept so no
 * writing is ever lost (ADR-009). Detecting and resolving conflicts belongs to
 * the `notes-conflicts` module; domain only fixes the shape.
 *
 * `hlc` is opaque here: domain has no clock and never parses it.
 */
export const noteConflictSchema = z
  .object({
    id: z.string().min(1),
    noteItemId: z.string().min(1),
    text: trimmedText(1, NOTE_TEXT_MAX_LENGTH),
    fromDeviceId: z.string().min(1),
    hlc: z.string().min(1),
    createdAt: isoDateTimeSchema,
    resolved: z.boolean(),
  })
  .strict();

export type NoteConflict = z.infer<typeof noteConflictSchema>;
