import type { StorageAdapter } from '../adapter';
import type { PendingOp } from './write';

export const PENDING_OP_TABLES = ['pending_ops'] as const;

export type ListPendingOptions = {
  /** A push sends a batch at a time; the plan suggests 500. */
  limit?: number;
};

type PendingOpRow = { id: string; payload: string; created_at: string };

/**
 * The outbox: edits this device has made and the server has not acknowledged.
 *
 * `payload` is opaque here. `sync-core` owns the format, and storage stores the
 * text unchanged and hands it back byte for byte, so the two modules can change
 * independently. Order is insertion order, held by an autoincrementing sequence
 * rather than a timestamp: two edits in the same millisecond still have an
 * order, and a device whose clock jumps backwards does not reorder its queue.
 */
export const appendPendingOp = async (adapter: StorageAdapter, op: PendingOp): Promise<void> => {
  await adapter.execute('INSERT INTO pending_ops (id, payload, created_at) VALUES (?, ?, ?)', [
    op.id,
    op.payload,
    op.createdAt,
  ]);
};

export const listPendingOps = async (
  adapter: StorageAdapter,
  options: ListPendingOptions = {},
): Promise<PendingOp[]> => {
  const rows = await adapter.execute<PendingOpRow>(
    'SELECT id, payload, created_at FROM pending_ops ORDER BY seq LIMIT ?',
    [options.limit ?? 500],
  );

  return rows.map((row) => ({ id: row.id, payload: row.payload, createdAt: row.created_at }));
};

/**
 * Drops the ops the server confirmed. Ids it does not hold are ignored, so a
 * retried acknowledgement is harmless — the same reason the server treats a
 * repeated push as a no-op.
 */
export const deletePendingOps = async (
  adapter: StorageAdapter,
  ids: readonly string[],
): Promise<void> => {
  if (ids.length === 0) return;

  const placeholders = ids.map(() => '?').join(', ');
  await adapter.execute(`DELETE FROM pending_ops WHERE id IN (${placeholders})`, ids);
};

/** How many edits are still waiting, for the debug screen and sync metrics. */
export const countPendingOps = async (adapter: StorageAdapter): Promise<number> => {
  const rows = await adapter.execute<{ count: number }>(
    'SELECT COUNT(*) AS count FROM pending_ops',
  );
  return rows[0]?.count ?? 0;
};
