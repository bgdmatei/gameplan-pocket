import { z } from 'zod';
import type { ServerEntity } from './columns';

/** Entities in the order a snapshot pages through them. */
export const SNAPSHOT_ORDER = [
  'entry_tag',
  'library_entry',
  'list',
  'list_item',
  'note_item',
] as const satisfies readonly ServerEntity[];

const cursorSchema = z
  .object({
    seq: z.number().int().nonnegative(),
    entity: z.enum(SNAPSHOT_ORDER),
    // Not capped by length here: the door already capped every row id.
    id: z.string().min(1),
  })
  .strict();

/** Where a snapshot is up to: its log position and the last row it sent. */
export type SnapshotCursor = z.infer<typeof cursorSchema>;

/**
 * Opaque to the device. It holds only the snapshot's position, so a forged
 * one can do no more than page the forger's own rows from a made-up place:
 * the user still comes from the token.
 */
export const encodeCursor = (cursor: SnapshotCursor): string =>
  Buffer.from(JSON.stringify(cursor)).toString('base64url');

export const decodeCursor = (text: string): SnapshotCursor | null => {
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(text, 'base64url').toString()));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};
