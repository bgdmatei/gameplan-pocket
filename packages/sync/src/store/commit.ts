import { getSyncState, readSyncedRow, updateSyncState, writeRows } from '@gameplan/storage';
import type { StorageAdapter, Transaction } from '@gameplan/storage';
import { tick } from '../clock/hlc';
import { newId, newNodeId } from '../ids';
import { DELETE_CLOCK, isDeleted } from '../merge/merge';
import { OP_SCHEMA_VERSION, opSchema } from '../op/schema';
import type { Op } from '../op/schema';
import { codecFor, isoAt, parseClocks, stringifyClocks } from './entities';
import type { DeletableEntity, EntityValues, StoredEntity, SyncEnv } from './entities';

/** The result of a domain write rule, ready to commit. */
export type LocalChange<E extends StoredEntity> = {
  entity: E;
  next: EntityValues[E];
  /** Exactly the domain rule's `changed`: what the op tells other devices. */
  changed: Partial<EntityValues[E]>;
  /** Note text edits only: the clock of the text the edit started from. */
  baseHlc?: string;
};

/**
 * Issues the next clock value, creating this device's node id on first use.
 * Both are saved in the caller's transaction, so a crash never leaves a clock
 * value given out but not remembered.
 */
const nextClock = async (tx: Transaction, env: SyncEnv) => {
  const state = await getSyncState(tx);
  const nodeId = state.nodeId ?? newNodeId(env.randomBytes);
  const nowMs = env.now();
  const hlc = tick(state.hlcLast, nowMs, nodeId);

  await updateSyncState(tx, { nodeId, hlcLast: hlc });
  return { hlc, nowMs };
};

/**
 * Validated against the allowlist before it is queued: an op this device could
 * not push would sit in the outbox forever.
 */
const queue = (op: unknown, nowMs: number) => {
  const parsed = opSchema.parse(op);
  return {
    op: parsed,
    pending: { id: parsed.id, payload: JSON.stringify(parsed), createdAt: isoAt(nowMs) },
  };
};

/**
 * Commits a local edit: the row, its per-field clocks, the outbox entry and
 * the clock state, in one transaction. All land or none do.
 *
 * An empty `changed` writes nothing and returns `null`: re-saving an unchanged
 * form must not send an op.
 */
export const commitLocalChange = async <E extends StoredEntity>(
  adapter: StorageAdapter,
  env: SyncEnv,
  { entity, next, changed, baseHlc }: LocalChange<E>,
): Promise<Op | null> => {
  const fields = Object.keys(changed);
  if (fields.length === 0) return null;

  return adapter.transaction(async (tx) => {
    const codec = codecFor(entity);
    const { hlc, nowMs } = await nextClock(tx, env);
    const stored = await readSyncedRow(tx, codec, next.id);

    const clocks = parseClocks(stored?.fieldHlc);
    for (const field of fields) clocks[field] = hlc;

    const { op, pending } = queue(
      {
        id: newId(env.randomBytes, nowMs),
        entity,
        entityId: next.id,
        type: 'set',
        fields: changed,
        ...(baseHlc === undefined ? {} : { baseHlc }),
        hlc,
        schemaVersion: OP_SCHEMA_VERSION,
      },
      nowMs,
    );

    const meta = {
      fieldHlc: stringifyClocks(clocks),
      deleted: isDeleted(clocks),
      now: isoAt(nowMs),
    };
    await writeRows(tx, {
      rows: [{ table: codec.table, row: codec.toRow(next, meta) }],
      ops: [pending],
    });
    return op;
  });
};

/**
 * Commits a newly created row, or re-adds one: every field but the id is sent,
 * since the other devices know nothing of it yet. The domain's create rules
 * return the value alone, so this saves every caller building `changed` by hand.
 */
export const commitLocalCreate = async <E extends StoredEntity>(
  adapter: StorageAdapter,
  env: SyncEnv,
  { entity, next }: { entity: E; next: EntityValues[E] },
): Promise<Op> => {
  const changed = Object.fromEntries(
    Object.entries(next).filter(([field]) => field !== 'id'),
  ) as Partial<EntityValues[E]>;
  const op = await commitLocalChange(adapter, env, { entity, next, changed });
  if (op === null) throw new Error(`A new ${entity} must have fields to send.`);
  return op;
};

/**
 * Commits a local delete: the row's tombstone and delete clock, the outbox
 * entry and the clock state, in one transaction. Touches this row only;
 * deletes never cascade (SPEC-sync-core.md §Merge).
 */
export const commitLocalDelete = async (
  adapter: StorageAdapter,
  env: SyncEnv,
  { entity, entityId }: { entity: DeletableEntity; entityId: string },
): Promise<Op> =>
  adapter.transaction(async (tx) => {
    const codec = codecFor(entity);
    const stored = await readSyncedRow(tx, codec, entityId);
    if (stored === null) throw new Error(`Cannot delete ${entity} ${entityId}: it does not exist.`);

    const { hlc, nowMs } = await nextClock(tx, env);
    const clocks = { ...parseClocks(stored.fieldHlc), [DELETE_CLOCK]: hlc };

    const { op, pending } = queue(
      {
        id: newId(env.randomBytes, nowMs),
        entity,
        entityId,
        type: 'delete',
        hlc,
        schemaVersion: OP_SCHEMA_VERSION,
      },
      nowMs,
    );

    const meta = { fieldHlc: stringifyClocks(clocks), deleted: true, now: isoAt(nowMs) };
    await writeRows(tx, {
      rows: [{ table: codec.table, row: codec.toRow(stored.value, meta) }],
      ops: [pending],
    });
    return op;
  });
