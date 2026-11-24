import { getSyncState, readSyncedRow, updateSyncState, writeRows } from '@gameplan/storage';
import { resolveConflict } from '@gameplan/domain';
import type { ConflictChoice, NoteConflict, NoteItem } from '@gameplan/domain';
import type { StorageAdapter, Transaction } from '@gameplan/storage';
import { tick } from '../clock/hlc';
import { newId } from '../ids';
import { DELETE_CLOCK, carriesTextBase, isDeleted, withTextBase } from '../merge/merge';
import { OP_SCHEMA_VERSION, opSchema } from '../op/schema';
import type { Op } from '../op/schema';
import { codecFor, isoAt, parseClocks, stringifyClocks } from './entities';
import { ensureNodeId } from './node-id';
import type { DeletableEntity, EntityValues, StoredEntity, SyncEnv } from './entities';

/** The result of a domain write rule, ready to commit. */
export type LocalChange<E extends StoredEntity> = {
  next: EntityValues[E];
  /** Exactly the domain rule's `changed`: what the op tells other devices. */
  changed: Partial<EntityValues[E]>;
  /** Note text edits only: the clock of the text the edit started from. */
  baseHlc?: string;
};

/**
 * An edit to an existing row. `update` is the domain write rule, given the row
 * as it stands inside the transaction, never a copy a screen read earlier.
 */
export type LocalEdit<E extends StoredEntity> = {
  entity: E;
  id: string;
  update: (current: EntityValues[E]) => LocalChange<E>;
};

/**
 * Issues the next clock value, creating this device's node id on first use.
 * Both are saved in the caller's transaction, so a crash never leaves a clock
 * value given out but not remembered.
 */
const nextClock = async (tx: Transaction, env: SyncEnv) => {
  const nodeId = await ensureNodeId(tx, env.randomBytes);
  const state = await getSyncState(tx);
  const nowMs = env.now();
  const hlc = tick(state.hlcLast, nowMs, nodeId);

  await updateSyncState(tx, { hlcLast: hlc });
  return { hlc, nowMs };
};

/**
 * Validated against the allowlist before it is queued: an op this device could
 * not push would sit in the outbox forever.
 */
export const queue = (op: unknown, nowMs: number) => {
  const parsed = opSchema.parse(op);
  return {
    op: parsed,
    pending: { id: parsed.id, payload: JSON.stringify(parsed), createdAt: isoAt(nowMs) },
  };
};

/**
 * Writes a change on top of the clocks the row already had: the row, its
 * per-field clocks, the outbox entry and the clock state. Callers hold the
 * transaction, so all land or none do.
 */
const writeChange = async <E extends StoredEntity>(
  tx: Transaction,
  env: SyncEnv,
  entity: E,
  { next, changed, baseHlc }: LocalChange<E>,
  fieldHlc: string | undefined,
): Promise<Op> => {
  const codec = codecFor(entity);
  const { hlc, nowMs } = await nextClock(tx, env);

  let clocks = parseClocks(fieldHlc);
  for (const field of Object.keys(changed)) clocks[field] = hlc;
  if (carriesTextBase(entity, changed)) clocks = withTextBase(clocks, baseHlc);

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

  const meta = { fieldHlc: stringifyClocks(clocks), deleted: isDeleted(clocks), now: isoAt(nowMs) };
  await writeRows(tx, {
    rows: [{ table: codec.table, row: codec.toRow(next, meta) }],
    ops: [pending],
  });
  return op;
};

/**
 * Commits a local edit. The row is read, the domain rule applied and the
 * result written in one transaction, so a change that landed after a screen
 * loaded the row (another edit, or one pulled from another device) is edited
 * on top of rather than overwritten.
 *
 * An empty `changed` writes nothing and returns `null`: re-saving an unchanged
 * form must not send an op. A rule that throws writes nothing either.
 */
export const commitLocalEdit = async <E extends StoredEntity>(
  adapter: StorageAdapter,
  env: SyncEnv,
  { entity, id, update }: LocalEdit<E>,
): Promise<Op | null> =>
  adapter.transaction(async (tx) => {
    const stored = await readSyncedRow(tx, codecFor(entity), id);
    if (stored === null) throw new Error(`Cannot edit ${entity} ${id}: it does not exist.`);

    const change = update(stored.value as EntityValues[E]);
    if (change.next.id !== id) {
      throw new Error(`An edit to ${entity} ${id} returned ${change.next.id} instead.`);
    }
    if (Object.keys(change.changed).length === 0) return null;

    return writeChange(tx, env, entity, change, stored.fieldHlc);
  });

/**
 * Commits the user's choice for one note conflict: the note's text, when the
 * choice changes it, and the conflict marked resolved, in one transaction, so
 * a crash never leaves the text changed and the conflict still open.
 *
 * `baseHlc` is the note's text clock when the choice was shown, as a note
 * editor's session base: an edit that arrived after that makes the choice a
 * race, and the text it would replace becomes a conflict, never lost (ADR-009).
 *
 * @throws {DomainValidationError} when keeping both would pass the note
 * limit; nothing is written.
 */
export const commitConflictResolution = async (
  adapter: StorageAdapter,
  env: SyncEnv,
  {
    conflictId,
    choice,
    baseHlc,
  }: { conflictId: string; choice: ConflictChoice; baseHlc: string | null },
): Promise<Op[]> =>
  adapter.transaction(async (tx) => {
    // A deleted row counts as gone: an edit newer than a delete brings the row
    // back, so writing the text would revive a note deleted while choosing.
    const conflict = await readSyncedRow(tx, codecFor('note_conflict'), conflictId);
    if (conflict === null || conflict.deleted) {
      throw new Error(`Cannot resolve conflict ${conflictId}: it does not exist.`);
    }
    const held = conflict.value as NoteConflict;
    const note = await readSyncedRow(tx, codecFor('note_item'), held.noteItemId);
    if (note === null || note.deleted) {
      throw new Error(`Cannot resolve conflict ${conflictId}: its note is gone.`);
    }

    const resolution = resolveConflict(note.value as NoteItem, held, choice);
    const ops: Op[] = [];
    if (resolution.note !== undefined) {
      const edit = { ...resolution.note, ...(baseHlc === null ? {} : { baseHlc }) };
      ops.push(await writeChange(tx, env, 'note_item', edit, note.fieldHlc));
    }
    if (Object.keys(resolution.conflict.changed).length > 0) {
      ops.push(await writeChange(tx, env, 'note_conflict', resolution.conflict, conflict.fieldHlc));
    }
    return ops;
  });

/**
 * Commits a newly created row, or re-adds one: every field but the id is sent,
 * since the other devices know nothing of it yet. The domain's create rules
 * return the value alone, so this saves every caller building `changed` by hand.
 *
 * A re-add keeps the clocks the row already had, so a tag removed and added
 * back comes back with clocks newer than its delete.
 */
export const commitLocalCreate = async <E extends StoredEntity>(
  adapter: StorageAdapter,
  env: SyncEnv,
  { entity, next }: { entity: E; next: EntityValues[E] },
): Promise<Op> => {
  const changed = Object.fromEntries(
    Object.entries(next).filter(([field]) => field !== 'id'),
  ) as Partial<EntityValues[E]>;
  if (Object.keys(changed).length === 0)
    throw new Error(`A new ${entity} must have fields to send.`);

  return adapter.transaction(async (tx) => {
    const stored = await readSyncedRow(tx, codecFor(entity), next.id);
    return writeChange(tx, env, entity, { next, changed }, stored?.fieldHlc);
  });
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
