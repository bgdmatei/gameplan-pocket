import { z } from 'zod';

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

/**
 * Allowed status changes (SPEC-domain-model.md §Status state machine).
 *
 * Notable edges:
 * - `backlog -> completed`: logging a game finished before the app existed.
 * - `wishlist -> dropped`: lost interest before buying.
 * - `completed` is nearly terminal: only `-> playing`, so a completion isn't
 *   undone by accident. Replays aren't modelled.
 *
 * LOCAL WRITES ONLY. Merging must never consult this table: two devices can
 * each make a valid change offline (`playing -> completed` on one,
 * `playing -> dropped` on the other) and per-field LWW can land on a pair the
 * table would reject. Rejecting it during a merge would stop devices from
 * converging, so merges only check shape (`isWellFormed`).
 */
export const TRANSITIONS: Readonly<Record<EntryStatus, readonly EntryStatus[]>> = {
  wishlist: ['backlog', 'playing', 'dropped'],
  backlog: ['wishlist', 'playing', 'completed', 'dropped'],
  playing: ['backlog', 'paused', 'completed', 'dropped'],
  paused: ['backlog', 'playing', 'completed', 'dropped'],
  completed: ['playing'],
  dropped: ['backlog', 'playing'],
};

/** Re-setting the current status is a no-op, so it is always allowed. */
export const canTransition = (from: EntryStatus, to: EntryStatus): boolean =>
  from === to || TRANSITIONS[from].includes(to);
