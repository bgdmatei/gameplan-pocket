import { z } from 'zod';

/**
 * Sync's wire shapes (SPEC-sync-transport.md, ADR-023): push ops to the
 * server's log, pull the log back, and bootstrap a new device from a snapshot.
 */

/** Request bounds the API enforces, so a client never sends what it would refuse. */
export const SYNC_LIMITS = {
  pushMaxOps: 500,
  pullDefaultLimit: 500,
  pullMaxLimit: 500,
  snapshotDefaultLimit: 1000,
  snapshotMaxLimit: 1000,
  /** Longer than any id or entity name the app makes; keeps a hostile one off the log. */
  idMaxLength: 64,
} as const;

/** A position in one user's log. Sequence numbers start at 1; 0 means "before everything". */
const seqSchema = z.number().int().nonnegative();

/**
 * Ops are opaque here. Contracts sit on `domain` alone, and the op format
 * belongs to `sync`, which checks each op on its own: one malformed op is
 * rejected with a reason while the rest of its batch still lands, which a
 * schema over the whole array could not do.
 */
const opaqueOp = z.unknown();

/** Why the server refused one op. Nothing from a refused op is logged or merged. */
export const REJECTION_REASONS = [
  // Fails the op schema, including the field allowlist: a server-managed
  // column (`userId`, `deleted`, `fieldHlc`) or a malformed value.
  'invalid_op',
  // An entity the server doesn't sync yet (`note_conflict` until module 10).
  'unsupported_entity',
  // Its clock is too far ahead of the server's (`isTooFarAhead`, ADR-007).
  'clock_ahead',
] as const;

export const rejectionReasonSchema = z.enum(REJECTION_REASONS);
export type RejectionReason = z.infer<typeof rejectionReasonSchema>;

/** `POST /sync/push` */
export const pushRequestSchema = z.object({
  ops: z.array(opaqueOp).min(1).max(SYNC_LIMITS.pushMaxOps),
});
export type PushRequest = z.infer<typeof pushRequestSchema>;

/**
 * Every op in the request is named once, accepted or rejected. A resent op
 * (an id already in the log) counts as accepted, so the client can drop it.
 * A rejected op is named by its position, since a malformed op may have no id.
 */
export const pushResponseSchema = z.object({
  accepted: z.array(z.string().max(SYNC_LIMITS.idMaxLength)),
  rejected: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      opId: z.string().max(SYNC_LIMITS.idMaxLength).optional(),
      reason: rejectionReasonSchema,
    }),
  ),
  lastSeq: seqSchema,
});
export type PushResponse = z.infer<typeof pushResponseSchema>;

/** `GET /sync/pull?after=&limit=`, query strings coerced. */
export const pullQuerySchema = z.object({
  after: z.coerce.number().pipe(seqSchema),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(SYNC_LIMITS.pullMaxLimit)
    .default(SYNC_LIMITS.pullDefaultLimit),
});
export type PullQuery = z.infer<typeof pullQuerySchema>;

/** Ops after `after`, oldest first, the device's own included. */
export const pullResponseSchema = z.object({
  ops: z.array(z.object({ seq: seqSchema, op: opaqueOp })),
  lastSeq: seqSchema,
  hasMore: z.boolean(),
});
export type PullResponse = z.infer<typeof pullResponseSchema>;

/**
 * `GET /sync/snapshot?cursor=&limit=`. No cursor starts a snapshot; the
 * cursor is opaque and carries the snapshot's log position across pages.
 */
export const snapshotQuerySchema = z.object({
  cursor: z.string().min(1).max(256).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(SYNC_LIMITS.snapshotMaxLimit)
    .default(SYNC_LIMITS.snapshotDefaultLimit),
});
export type SnapshotQuery = z.infer<typeof snapshotQuerySchema>;

/**
 * One row as the server holds it: its fields (domain names), the clock of
 * each, and whether it is deleted. Shapes are checked on the device by
 * `sync`, which merges the row field by field rather than overwriting.
 */
const snapshotRowSchema = z.object({
  entity: z.string().min(1).max(SYNC_LIMITS.idMaxLength),
  id: z.string().min(1).max(SYNC_LIMITS.idMaxLength),
  fields: z.record(z.string(), z.unknown()),
  fieldHlc: z.record(z.string(), z.string()),
  deleted: z.boolean(),
});
export type SnapshotRow = z.infer<typeof snapshotRowSchema>;

/**
 * `seq` is the log position the snapshot started at, the same on every page.
 * After the last page (`nextCursor: null`), the device pulls from `seq`;
 * rows that changed while it paged are newer than `seq` and come again in
 * the pull, which merges them harmlessly.
 */
export const snapshotResponseSchema = z.object({
  rows: z.array(snapshotRowSchema),
  seq: seqSchema,
  nextCursor: z.string().min(1).max(256).nullable(),
});
export type SnapshotResponse = z.infer<typeof snapshotResponseSchema>;
