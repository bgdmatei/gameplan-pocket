import { getSyncState, readSyncedRow, updateSyncState, writeRows } from '@gameplan/storage';
import type { StorageAdapter, Transaction } from '@gameplan/storage';
import type { SnapshotRow } from '@gameplan/contracts';
import { receive } from '../clock/hlc';
import { isDeleted, mergeOp, mergeRow } from '../merge/merge';
import type { RowState } from '../merge/merge';
import { SYNCED_ENTITIES, opSchema } from '../op/schema';
import type { SyncedEntity } from '../op/schema';
import type { Op } from '../op/schema';
import { SCHEMAS, codecFor, isoAt, parseClocks, storedEntity, stringifyClocks } from './entities';
import type { StoredEntity, SyncEnv } from './entities';
import { ensureNodeId } from './node-id';

const isSyncedEntity = (entity: string): entity is SyncedEntity =>
  SYNCED_ENTITIES.some((known) => known === entity);

const withoutId = (value: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([field]) => field !== 'id'));

/**
 * Writes a merged row, after the shape check: a row this device has never
 * seen must arrive whole, or it is a bug to surface, not a state to guess at
 * (SPEC-sync-core.md, decision 8).
 */
const writeMerged = async (
  tx: Transaction,
  entity: StoredEntity,
  entityId: string,
  merged: RowState,
  nowMs: number,
  source: string,
): Promise<void> => {
  const codec = codecFor(entity);
  const value = SCHEMAS[entity].safeParse({ id: entityId, ...merged.fields });
  // A delete for a row this device never had (its create never reached the
  // log): there is nothing to show or hide, and refusing it would stop every
  // sync after it.
  if (!value.success && isDeleted(merged.clocks)) return;
  if (!value.success) {
    throw new Error(
      `Cannot apply ${source}: ${entity} ${entityId} is not on this device and it does not carry all of its fields.`,
    );
  }
  const meta = {
    fieldHlc: stringifyClocks(merged.clocks),
    deleted: isDeleted(merged.clocks),
    now: isoAt(nowMs),
  };
  await writeRows(tx, { rows: [{ table: codec.table, row: codec.toRow(value.data, meta) }] });
};

/**
 * Applies ops from other devices, and the cursor that covers them, in one
 * transaction: a crash between the two would skip changes or apply them twice.
 *
 * Each op is merged into its row with the same rules the server uses. Never
 * rejects a merged state for breaking a domain rule (SPEC-domain-model.md
 * §Merge safety), and re-applying an op changes nothing, so this device's own
 * ops coming back in a pull need no special case.
 *
 * Throws if an op names a row this device has never seen and does not carry
 * every field: the server log delivers a row's creation before any edit to it,
 * so that is a bug to surface, not a state to guess at (SPEC-sync-core.md,
 * decision 8).
 */
export const applyRemoteOps = async (
  adapter: StorageAdapter,
  env: SyncEnv,
  ops: readonly Op[],
  { lastPulledSeq }: { lastPulledSeq: number },
): Promise<{ applied: number }> =>
  adapter.transaction(async (tx) => {
    const nodeId = await ensureNodeId(tx, env.randomBytes);
    const state = await getSyncState(tx);
    const nowMs = env.now();
    let clock = state.hlcLast;
    let applied = 0;

    for (const incoming of ops) {
      const op = opSchema.parse(incoming);
      const entity = storedEntity(op.entity);
      const stored = await readSyncedRow(tx, codecFor(entity), op.entityId);

      const before = {
        fields: stored === null ? {} : withoutId(stored.value),
        clocks: parseClocks(stored?.fieldHlc),
      };
      const merged = mergeOp(before, op);
      clock = receive(clock, op.hlc, nowMs, nodeId);
      if (merged === before) continue;

      await writeMerged(tx, entity, op.entityId, merged, nowMs, `op ${op.id}`);
      applied += 1;
    }

    await updateSyncState(tx, { hlcLast: clock, lastPulledSeq });
    return { applied };
  });

/**
 * Applies the server's snapshot (every page of it) and the log position it
 * was read at, in one transaction, then marks the device bootstrapped. Each
 * row merges per field with what is here, so edits this device made offline
 * and hasn't pushed yet keep winning where they are newer.
 */
export const applySnapshot = async (
  adapter: StorageAdapter,
  env: SyncEnv,
  rows: readonly SnapshotRow[],
  { seq }: { seq: number },
): Promise<{ applied: number }> =>
  adapter.transaction(async (tx) => {
    const nodeId = await ensureNodeId(tx, env.randomBytes);
    const state = await getSyncState(tx);
    const nowMs = env.now();
    let clock = state.hlcLast;
    let applied = 0;

    for (const row of rows) {
      if (!isSyncedEntity(row.entity)) {
        throw new Error(`Cannot apply snapshot row: unknown entity ${row.entity}.`);
      }
      const entity = storedEntity(row.entity);
      const stored = await readSyncedRow(tx, codecFor(entity), row.id);
      const before = {
        fields: stored === null ? {} : withoutId(stored.value),
        clocks: parseClocks(stored?.fieldHlc),
      };
      const merged = mergeRow(before, { fields: row.fields, clocks: row.fieldHlc });
      for (const hlc of Object.values(row.fieldHlc)) clock = receive(clock, hlc, nowMs, nodeId);
      if (merged === before) continue;

      await writeMerged(tx, entity, row.id, merged, nowMs, 'snapshot row');
      applied += 1;
    }

    await updateSyncState(tx, { hlcLast: clock, lastPulledSeq: seq, bootstrapped: true });
    return { applied };
  });
