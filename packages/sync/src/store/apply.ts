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
 * Writes a merged row, after the shape check. A row this device doesn't hold
 * that can't be completed (its create never reached the log, as with rows
 * the Debug seed wrote without ops) is skipped, not thrown: throwing stopped
 * every later sync on that device (#26, revising SPEC-sync-core.md decision
 * 8; sync merges never reject a state). A row it does hold that fails the
 * shape check is still a bug, and still throws.
 */
const writeMerged = async (
  tx: Transaction,
  entity: StoredEntity,
  entityId: string,
  merged: RowState,
  { nowMs, known, source }: { nowMs: number; known: boolean; source: string },
): Promise<'written' | 'skipped' | 'unneeded'> => {
  const codec = codecFor(entity);
  const value = SCHEMAS[entity].safeParse({ id: entityId, ...merged.fields });
  if (!value.success) {
    // A delete for a row never held has nothing to show or hide.
    if (!known) return isDeleted(merged.clocks) ? 'unneeded' : 'skipped';
    throw new Error(`Cannot apply ${source}: ${entity} ${entityId} no longer has a valid shape.`);
  }
  const meta = {
    fieldHlc: stringifyClocks(merged.clocks),
    deleted: isDeleted(merged.clocks),
    now: isoAt(nowMs),
  };
  await writeRows(tx, { rows: [{ table: codec.table, row: codec.toRow(value.data, meta) }] });
  return 'written';
};

/**
 * Rows written, and changes passed over because their row couldn't be
 * completed (#26): counted per op or snapshot row, so several edits to one
 * missing row count several times.
 */
export type Applied = { applied: number; skipped: number };

const tally = (count: Applied, outcome: 'written' | 'skipped' | 'unneeded'): void => {
  if (outcome === 'written') count.applied += 1;
  if (outcome === 'skipped') count.skipped += 1;
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
 * An op for a row this device has never seen that doesn't carry every field
 * is skipped and counted (`writeMerged`).
 */
export const applyRemoteOps = async (
  adapter: StorageAdapter,
  env: SyncEnv,
  ops: readonly Op[],
  { lastPulledSeq }: { lastPulledSeq: number },
): Promise<Applied> =>
  adapter.transaction(async (tx) => {
    const nodeId = await ensureNodeId(tx, env.randomBytes);
    const state = await getSyncState(tx);
    const nowMs = env.now();
    let clock = state.hlcLast;
    const count: Applied = { applied: 0, skipped: 0 };

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

      const outcome = await writeMerged(tx, entity, op.entityId, merged, {
        nowMs,
        known: stored !== null,
        source: `op ${op.id}`,
      });
      tally(count, outcome);
    }

    await updateSyncState(tx, { hlcLast: clock, lastPulledSeq });
    return count;
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
): Promise<Applied> =>
  adapter.transaction(async (tx) => {
    const nodeId = await ensureNodeId(tx, env.randomBytes);
    const state = await getSyncState(tx);
    const nowMs = env.now();
    let clock = state.hlcLast;
    const count: Applied = { applied: 0, skipped: 0 };

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

      const outcome = await writeMerged(tx, entity, row.id, merged, {
        nowMs,
        known: stored !== null,
        source: 'snapshot row',
      });
      tally(count, outcome);
    }

    await updateSyncState(tx, { hlcLast: clock, lastPulledSeq: seq, bootstrapped: true });
    return count;
  });
