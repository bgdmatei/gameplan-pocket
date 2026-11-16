import type { StorageAdapter } from '../adapter';

export const REJECTED_OP_TABLES = ['rejected_ops'] as const;

/** One op the server refused, as the sync loop reports it. */
export type Rejection = {
  /** The op's id, as queued in the outbox. */
  id: string;
  entity: string;
  /** The server's reason, opaque here (`invalid_op`, `clock_ahead`, ...). */
  reason: string;
  rejectedAt: string;
};

/**
 * A refused op as Debug lists it: what and why, never the payload, which may
 * hold note text (CLAUDE.md, privacy).
 */
export type RejectedOp = Rejection & { createdAt: string };

type RejectedOpRow = {
  id: string;
  entity: string;
  reason: string;
  created_at: string;
  rejected_at: string;
};

/**
 * Moves refused ops out of the outbox, in one transaction: a crash between
 * the two halves would either lose the op or push it again forever. Ids no
 * longer in the outbox are skipped, so a repeated report is harmless.
 */
export const rejectPendingOps = async (
  adapter: StorageAdapter,
  rejections: readonly Rejection[],
): Promise<void> => {
  if (rejections.length === 0) return;

  await adapter.transaction(async (tx) => {
    for (const { id, entity, reason, rejectedAt } of rejections) {
      await tx.execute(
        `INSERT OR IGNORE INTO rejected_ops (id, entity, reason, payload, created_at, rejected_at)
         SELECT id, ?, ?, payload, created_at, ? FROM pending_ops WHERE id = ?`,
        [entity, reason, rejectedAt, id],
      );
      await tx.execute('DELETE FROM pending_ops WHERE id = ?', [id]);
    }
  });
};

/** Oldest refusal first. */
export const listRejectedOps = async (adapter: StorageAdapter): Promise<RejectedOp[]> => {
  const rows = await adapter.execute<RejectedOpRow>(
    'SELECT id, entity, reason, created_at, rejected_at FROM rejected_ops ORDER BY seq',
  );

  return rows.map((row) => ({
    id: row.id,
    entity: row.entity,
    reason: row.reason,
    createdAt: row.created_at,
    rejectedAt: row.rejected_at,
  }));
};
