import {
  clearSyncedRows,
  getSyncState,
  readSyncedRow,
  updateSyncState,
  writeRows,
} from '@gameplan/storage';
import type { StorageAdapter, Transaction } from '@gameplan/storage';
import type { SnapshotRow } from '@gameplan/contracts';
import { parseHlc, receive } from '../clock/hlc';
import { conflictFromLosingEdit, losingText } from '../conflicts/conflicts';
import type { HeldText } from '../conflicts/conflicts';
import { newId } from '../ids';
import {
  BASE_TEXT_CLOCK,
  fieldClocks,
  isDeleted,
  isEditClock,
  knownReservedClocks,
  mergeOp,
  mergeRow,
} from '../merge/merge';
import type { RowState } from '../merge/merge';
import { toCurrentOp } from '../compat/v1';
import { OP_SCHEMA_VERSION, isSyncedEntity, knownFields, opSchema } from '../op/schema';
import type { Op } from '../op/schema';
import { SCHEMAS, codecFor, isoAt, parseClocks, stringifyClocks } from './entities';
import type { StoredEntity, SyncEnv } from './entities';
import { queue } from './commit';
import { ensureNodeId } from './node-id';

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

type Detect = { env: SyncEnv; nowMs: number; nodeId: string };

/**
 * Keeps the text a pulled edit raced as a note conflict, in the caller's
 * transaction (ADR-009). Never for this device's own edits coming back: their
 * races are found by the devices that held the other text. Nor for a text
 * another edit in the same pull was built on: that one was replaced on purpose.
 *
 * The conflict's op carries the losing clock, not a fresh one, and merges into
 * whatever row is there: every device that spots the race writes the same row
 * at the same clock, so a late copy can't reopen a resolved conflict. It is
 * queued only when it changed the row; one that arrived from elsewhere is
 * already on the server. A conflict that fails its checks is skipped, never
 * thrown: a throw here would stop every later pull (#26).
 */
const keepLosingText = async (
  tx: Transaction,
  noteItemId: string,
  held: RowState,
  incoming: HeldText,
  { env, nowMs, nodeId, replaced }: Detect & { replaced: ReadonlySet<string> },
): Promise<void> => {
  if (parseHlc(incoming.hlc).nodeId === nodeId) return;
  const heldClock = fieldClocks(held.clocks).text;
  const heldText = held.fields.text;
  if (heldClock === undefined || typeof heldText !== 'string') return;
  const losing = losingText(
    { text: heldText, hlc: heldClock, baseHlc: held.clocks[BASE_TEXT_CLOCK] },
    incoming,
  );
  if (losing === null || replaced.has(losing.hlc)) return;

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

/** A pulled note text edit, as the other side of a possible race. */
const textEditOf = (op: Op): HeldText | null =>
  op.entity === 'note_item' && op.type === 'set' && op.fields.text !== undefined
    ? { text: op.fields.text, hlc: op.hlc, baseHlc: op.baseHlc }
    : null;

const mergeOps = async (
  tx: Transaction,
  ops: readonly Op[],
  { env, nowMs, nodeId, clock: start }: Detect & { clock: string | null },
  count: Applied,
): Promise<string | null> => {
  let clock = start;
  const parsed = ops.map((op) => opSchema.parse(op));
  // Texts some edit in this pull was built on: replaced on purpose, not lost.
  // Per page: a chain split across pages can raise an extra conflict, the
  // accepted cost (ADR-009); a lost text is never one.
  const replaced = new Set(parsed.flatMap((op) => textEditOf(op)?.baseHlc ?? []));

  for (const op of parsed) {
    const { entity } = op;
    const stored = await readSyncedRow(tx, codecFor(entity), op.entityId);

    const before = {
      fields: stored === null ? {} : withoutId(stored.value),
      clocks: parseClocks(stored?.fieldHlc),
    };
    const edit = textEditOf(op);
    if (edit !== null) {
      await keepLosingText(tx, op.entityId, before, edit, { env, nowMs, nodeId, replaced });
    }
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
  return clock;
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
    const count: Applied = { applied: 0, skipped: 0 };
    const clock = await mergeOps(
      tx,
      ops,
      { env, nowMs: env.now(), nodeId, clock: state.hlcLast },
      count,
    );
    await updateSyncState(tx, { hlcLast: clock, lastPulledSeq });
    return count;
  });

/**
 * Applies the server's snapshot (every page of it) and the log position it
 * was read at, in one transaction, then marks the device bootstrapped. Each
 * row merges per field with what is here, so edits this device made offline
 * and hasn't pushed yet keep winning where they are newer.
 *
 * With `resync`, synced rows are rebuilt from the snapshot, unpushed outbox on top.
 */
export const applySnapshot = async (
  adapter: StorageAdapter,
  env: SyncEnv,
  rows: readonly SnapshotRow[],
  { seq, resync = false }: { seq: number; resync?: boolean },
): Promise<Applied> =>
  adapter.transaction(async (tx) => {
    const nodeId = await ensureNodeId(tx, env.randomBytes);
    const state = await getSyncState(tx);
    const nowMs = env.now();
    let clock = state.hlcLast;
    const count: Applied = { applied: 0, skipped: 0 };
    if (resync) await clearSyncedRows(tx);

    for (const row of rows) {
      if (!isSyncedEntity(row.entity)) {
        throw new Error(`Cannot apply snapshot row: unknown entity ${row.entity}.`);
      }
      const { entity } = row;
      const stored = await readSyncedRow(tx, codecFor(entity), row.id);
      const before = {
        fields: stored === null ? {} : withoutId(stored.value),
        clocks: parseClocks(stored?.fieldHlc),
      };
      // Fields and reserved keys a newer server sends are dropped with their
      // clocks (ADR-017); the clock still learns every edit's clock it has
      // seen. A base is no edit's clock, so it never moves the clock.
      const remote = {
        fields: knownFields(row.entity, row.fields),
        clocks: {
          ...knownFields(row.entity, fieldClocks(row.fieldHlc)),
          ...knownReservedClocks(row.fieldHlc),
        },
      };
      const remoteText = remote.fields.text;
      const remoteClock = fieldClocks(remote.clocks).text;
      if (entity === 'note_item' && typeof remoteText === 'string' && remoteClock !== undefined) {
        const incoming = {
          text: remoteText,
          hlc: remoteClock,
          baseHlc: remote.clocks[BASE_TEXT_CLOCK],
        };
        const replaced = new Set<string>();
        await keepLosingText(tx, row.id, before, incoming, { env, nowMs, nodeId, replaced });
      }
      const merged = mergeRow(entity, before, remote);
      for (const [key, hlc] of Object.entries(row.fieldHlc)) {
        if (isEditClock(key)) clock = receive(clock, hlc, nowMs, nodeId);
      }
      if (merged === before) continue;

      const outcome = await writeMerged(tx, entity, row.id, merged, {
        nowMs,
        known: stored !== null,
        source: 'snapshot row',
      });
      tally(count, outcome);
    }

    if (resync) {
      // Read here, in the same transaction as the clear, or an edit made mid-sync would be lost.
      const queued = await tx.execute<{ payload: string }>(
        'SELECT payload FROM pending_ops ORDER BY seq',
      );
      const outbox = queued.flatMap(({ payload }) => {
        const op = toCurrentOp(JSON.parse(payload) as unknown);
        if (op === null) count.skipped += 1;
        return op ?? [];
      });
      clock = await mergeOps(tx, outbox, { env, nowMs, nodeId, clock }, count);
    }
    await updateSyncState(tx, {
      hlcLast: clock,
      lastPulledSeq: seq,
      bootstrapped: true,
      resync: false,
    });
    return count;
  });
