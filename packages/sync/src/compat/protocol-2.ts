import type { SnapshotRow } from '@gameplan/contracts';
import { DELETE_CLOCK, fieldClocks } from '../merge/merge';
import type { Op } from '../op/schema';

/*
 * What a protocol-2 app is served. Its builds predate note
 * conflicts: they throw on a `note_conflict` op or row, which would stop every
 * later sync, and their merge knows `$delete` as its only reserved key.
 */

/** Null for an op a protocol-2 app can't apply. */
export const opForProtocol2 = (op: Op): Op | null => (op.entity === 'note_conflict' ? null : op);

/** Null for a row a protocol-2 app can't store; otherwise the row without reserved keys it doesn't know. */
export const rowForProtocol2 = (row: SnapshotRow): SnapshotRow | null => {
  if (row.entity === 'note_conflict') return null;
  const deletedAt = row.fieldHlc[DELETE_CLOCK];
  return {
    ...row,
    fieldHlc: {
      ...fieldClocks(row.fieldHlc),
      ...(deletedAt !== undefined && { [DELETE_CLOCK]: deletedAt }),
    },
  };
};
