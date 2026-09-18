import { z } from 'zod';

/**
 * Library entry statuses.
 *
 * The allowed transitions between them (SPEC-domain-model.md §Status state
 * machine) live alongside this enum and apply to *local writes only* — never
 * to merges. See status.ts's transition table.
 */
export const ENTRY_STATUSES = [
  'wishlist',
  'backlog',
  'playing',
  'paused',
  'completed',
  'dropped',
] as const;

export const entryStatusSchema = z.enum(ENTRY_STATUSES);

export type EntryStatus = z.infer<typeof entryStatusSchema>;
