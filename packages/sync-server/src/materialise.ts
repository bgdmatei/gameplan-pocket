import { isDeleted, mergeOp } from '@gameplan/sync';
import type { Op, RowState } from '@gameplan/sync';

export type Materialised = {
  row: RowState;
  /** The op changed nothing (an older or redelivered op): skip the write. */
  changed: boolean;
  /** The stored `deleted` column, derived from the clocks on every write (ADR-008). */
  deleted: boolean;
};

/**
 * Folds one accepted op into the stored row with the phone's own merge, so
 * the server can never hold a state a device wouldn't reach. No domain rules:
 * a merge accepts whatever state per-field LWW produces (ADR-023).
 */
export const materialise = (row: RowState, op: Op): Materialised => {
  const next = mergeOp(row, op);
  return { row: next, changed: next !== row, deleted: isDeleted(next.clocks) };
};
