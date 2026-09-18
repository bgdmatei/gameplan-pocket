import { z } from 'zod';
import { trimmedText } from '../shared/text';

/**
 * Games differ too much for one progress field, so it is a tagged union.
 * It is treated as a SINGLE field when syncing: type and value always travel
 * together, so a merge can't pair one device's type with another's value.
 */
export const progressSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('percentage'), value: z.number().int().min(0).max(100) }),
    z.object({ type: z.literal('chapter'), value: trimmedText(1, 100) }),
    z.object({
      type: z.literal('achievements'),
      earned: z.number().int().min(0),
      total: z.number().int().min(1),
    }),
    z.object({ type: z.literal('freeform'), value: trimmedText(1, 200) }),
  ])
  .refine((progress) => progress.type !== 'achievements' || progress.earned <= progress.total, {
    message: 'Earned achievements cannot exceed the total.',
    path: ['earned'],
  });

export type Progress = z.infer<typeof progressSchema>;
