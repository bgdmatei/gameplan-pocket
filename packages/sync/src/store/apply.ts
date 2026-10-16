import { getSyncState, readSyncedRow, updateSyncState, writeRows } from '@gameplan/storage';
import type { StorageAdapter } from '@gameplan/storage';
import { receive } from '../clock/hlc';
import { isDeleted, mergeOp } from '../merge/merge';
import { opSchema } from '../op/schema';
import type { Op } from '../op/schema';
import { SCHEMAS, codecFor, isoAt, parseClocks, storedEntity, stringifyClocks } from './entities';
import type { SyncEnv } from './entities';
import { ensureNodeId } from './node-id';

const withoutId = (value: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([field]) => field !== 'id'));

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
      const codec = codecFor(entity);
      const stored = await readSyncedRow(tx, codec, op.entityId);

      const before = {
        fields: stored === null ? {} : withoutId(stored.value),
        clocks: parseClocks(stored?.fieldHlc),
      };
      const merged = mergeOp(before, op);
      clock = receive(clock, op.hlc, nowMs, nodeId);
      if (merged === before) continue;

      const value = SCHEMAS[entity].safeParse({ id: op.entityId, ...merged.fields });
      if (!value.success) {
        throw new Error(
          `Cannot apply op ${op.id}: ${op.entity} ${op.entityId} is not on this device and the op does not carry all of its fields.`,
        );
      }

      const meta = {
        fieldHlc: stringifyClocks(merged.clocks),
        deleted: isDeleted(merged.clocks),
        now: isoAt(nowMs),
      };
      await writeRows(tx, { rows: [{ table: codec.table, row: codec.toRow(value.data, meta) }] });
      applied += 1;
    }

    await updateSyncState(tx, { hlcLast: clock, lastPulledSeq });
    return { applied };
  });
