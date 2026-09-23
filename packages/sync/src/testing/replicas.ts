import fc from 'fast-check';
import { receive, tick } from '../clock/hlc';
import { EMPTY_ROW, isDeleted, mergeOp } from '../merge/merge';
import type { RowState } from '../merge/merge';
import type { Op, SyncedEntity } from '../op/schema';

/**
 * In-memory devices for the convergence property: each holds rows and a
 * clock, makes local edits, and merges ops from the others. No storage and no
 * network, so thousands of scenarios run in a second.
 */
export type Replica = {
  nodeId: string;
  clock: string | null;
  rows: Map<string, RowState>;
};

export const NODE_IDS = ['00000000000000a1', '00000000000000b2', '00000000000000c3'] as const;

export const createReplicas = (): Replica[] =>
  NODE_IDS.map((nodeId) => ({ nodeId, clock: null, rows: new Map() }));

const rowKey = (op: Pick<Op, 'entity' | 'entityId'>): string => `${op.entity}/${op.entityId}`;

const store = (replica: Replica, op: Op): void => {
  const key = rowKey(op);
  replica.rows.set(key, mergeOp(replica.rows.get(key) ?? EMPTY_ROW, op));
};

/** A local edit: tick the clock, apply the op here, hand it back to send on. */
export const edit = (replica: Replica, change: Change, nowMs: number, opId: string): Op => {
  replica.clock = tick(replica.clock, nowMs, replica.nodeId);
  const envelope = {
    id: opId,
    entity: change.entity,
    entityId: change.entityId,
    hlc: replica.clock,
    schemaVersion: 1 as const,
  };
  const op = (
    change.fields === null
      ? { ...envelope, type: 'delete' }
      : { ...envelope, type: 'set', fields: change.fields }
  ) as Op;

  store(replica, op);
  return op;
};

/** An op arriving from another device: merge it and move the clock past it. */
export const deliver = (replica: Replica, op: Op, nowMs: number): void => {
  replica.clock = receive(replica.clock, op.hlc, nowMs, replica.nodeId);
  store(replica, op);
};

/** Everything a replica holds, in a form that compares equal across replicas. */
export const snapshot = (replica: Replica) =>
  Object.fromEntries(
    [...replica.rows.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, row]) => [key, { ...row, deleted: isDeleted(row.clocks) }]),
  );

/** A set of fields, or `null` for a delete. */
export type Change = {
  entity: SyncedEntity;
  entityId: string;
  fields: Record<string, unknown> | null;
};

/*
 * Deliberately tiny pools: two rows per entity, a few values per field and a
 * narrow clock range, so replicas keep editing the same field of the same row
 * in the same millisecond. A generator that rarely collides proves nothing.
 */
const entryFields = fc.record(
  {
    status: fc.constantFrom('playing', 'completed', 'dropped'),
    rating: fc.constantFrom(null, 4, 8),
    favourite: fc.boolean(),
    archived: fc.boolean(),
  },
  { requiredKeys: [] },
);
const noteFields = fc.record(
  { text: fc.constantFrom('lever', 'key'), resolved: fc.boolean() },
  { requiredKeys: [] },
);

const changeFor = (
  entity: SyncedEntity,
  fields: fc.Arbitrary<Record<string, unknown>>,
  { deletable }: { deletable: boolean },
): fc.Arbitrary<Change> => {
  const set = fields.filter((value) => Object.keys(value).length > 0);
  return fc.record({
    entity: fc.constant(entity),
    entityId: fc.constantFrom('row-1', 'row-2'),
    fields: deletable
      ? fc.oneof({ weight: 1, arbitrary: fc.constant(null) }, { weight: 3, arbitrary: set })
      : set,
  });
};

export const changeArb: fc.Arbitrary<Change> = fc.oneof(
  // Games are archived, never deleted (SPEC-domain-model.md decision 12).
  changeFor('library_entry', entryFields, { deletable: false }),
  changeFor('note_item', noteFields, { deletable: true }),
);

/** Device time jumps around, including backwards, within a narrow range. */
export const nowArb = fc.integer({ min: 0, max: 20 });

/**
 * One step of a scenario: a replica edits locally, or an op already made by
 * someone is delivered to a replica (again, perhaps: duplicates are allowed).
 */
export const stepArb = fc.oneof(
  fc.record({
    kind: fc.constant('edit' as const),
    replica: fc.nat(NODE_IDS.length - 1),
    change: changeArb,
    now: nowArb,
  }),
  fc.record({
    kind: fc.constant('deliver' as const),
    replica: fc.nat(NODE_IDS.length - 1),
    // Index into the ops made so far, taken modulo their count.
    op: fc.nat(),
    now: nowArb,
  }),
);
