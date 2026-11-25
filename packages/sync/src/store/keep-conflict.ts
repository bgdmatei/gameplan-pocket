import { readSyncedRow, writeRows } from '@gameplan/storage';
import type { Transaction } from '@gameplan/storage';
import { conflictFromLosingEdit } from '../conflicts/conflicts';
import { newId } from '../ids';
import { isDeleted, mergeOp } from '../merge/merge';
import { OP_SCHEMA_VERSION, opSchema } from '../op/schema';
import { SCHEMAS, codecFor, isoAt, parseClocks, stringifyClocks } from './entities';
import type { SyncEnv } from './entities';
import { queue } from './queue';

const withoutId = (value: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([field]) => field !== 'id'));

/**
 * Keeps a losing note text as a note conflict, in the caller's transaction
 * (ADR-009). The conflict's op carries the losing clock, not a fresh one, and
 * merges into whatever row is there: every device that spots the race writes
 * the same row at the same clock, so a late copy can't reopen a resolved
 * conflict. It is queued only when it changed the row; one that arrived from
 * elsewhere is already on the server. A conflict that fails its checks is
 * skipped, never thrown: a throw here would stop every later pull (#26).
 */
export const keepConflict = async (
  tx: Transaction,
  env: SyncEnv,
  nowMs: number,
  noteItemId: string,
  losing: { text: string; hlc: string },
): Promise<void> => {
  const { id, ...fields } = conflictFromLosingEdit(noteItemId, losing);
  const op = opSchema.safeParse({
    id: newId(env.randomBytes, nowMs),
    entity: 'note_conflict',
    entityId: id,
    type: 'set',
    fields,
    hlc: losing.hlc,
    schemaVersion: OP_SCHEMA_VERSION,
  });
  if (!op.success) return;
  const codec = codecFor('note_conflict');
  const stored = await readSyncedRow(tx, codec, id);
  const current = {
    fields: stored === null ? {} : withoutId(stored.value),
    clocks: parseClocks(stored?.fieldHlc),
  };
  const merged = mergeOp(current, op.data);
  if (merged === current) return;
  const value = SCHEMAS.note_conflict.safeParse({ id, ...merged.fields });
  if (!value.success) return;

  const { pending } = queue(op.data, nowMs);
  const meta = {
    fieldHlc: stringifyClocks(merged.clocks),
    deleted: isDeleted(merged.clocks),
    now: isoAt(nowMs),
  };
  await writeRows(tx, {
    rows: [{ table: codec.table, row: codec.toRow(value.data, meta) }],
    ops: [pending],
  });
};
