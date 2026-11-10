import { materialise } from '@gameplan/sync-server';
import type { Op, RowState } from '@gameplan/sync';
import { sql } from 'kysely';
import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../db/schema';
import { ENTITY_TABLES, isServerEntity } from './columns';
import type { ServerEntity } from './columns';

export type SyncRepository = {
  /**
   * Logs and merges ops that already passed the door, in one transaction.
   * Ops already logged (same op id) are skipped. Returns the user's log
   * position afterwards.
   */
  push: (userId: string, ops: readonly Op[]) => Promise<{ lastSeq: number }>;
};

type Row = Record<string, unknown>;

/** A stored row as the merge sees it: only fields with a clock were ever set. */
const toRowState = (entity: ServerEntity, row: Row | undefined): RowState => {
  if (row === undefined) return { fields: {}, clocks: {} };
  const clocks = row['field_hlc'] as Record<string, string>;
  const fields: Record<string, unknown> = {};
  for (const [field, column] of Object.entries(ENTITY_TABLES[entity].columns)) {
    if (clocks[field] !== undefined) fields[field] = row[column] ?? null;
  }
  return { fields, clocks };
};

const writeRow = async (
  tx: Transaction<Database>,
  userId: string,
  entity: ServerEntity,
  id: string,
  state: RowState,
  deleted: boolean,
): Promise<void> => {
  const { table, columns, json } = ENTITY_TABLES[entity];
  const mapped: [string, unknown][] = [];
  // Only allowlisted fields reach SQL: a column name comes from the map, never the op.
  for (const [field, column] of Object.entries(columns)) {
    if (!(field in state.fields)) continue;
    const value = state.fields[field] ?? null;
    mapped.push([column, json.has(column) && value !== null ? JSON.stringify(value) : value]);
  }
  const all: [string, unknown][] = [
    ['user_id', userId],
    ['id', id],
    ['field_hlc', JSON.stringify(state.clocks)],
    ['deleted', deleted],
    ...mapped,
  ];
  const updates = all.filter(([column]) => column !== 'user_id' && column !== 'id');

  await sql`
    INSERT INTO ${sql.table(table)} (${sql.join(all.map(([column]) => sql.ref(column)))})
    VALUES (${sql.join(all.map(([, value]) => value))})
    ON CONFLICT (user_id, id) DO UPDATE SET ${sql.join(
      updates.map(([column]) => sql`${sql.ref(column)} = EXCLUDED.${sql.ref(column)}`),
    )}`.execute(tx);
};

const readRow = async (
  tx: Transaction<Database>,
  userId: string,
  entity: ServerEntity,
  id: string,
): Promise<Row | undefined> => {
  const { rows } = await sql<Row>`
    SELECT * FROM ${sql.table(ENTITY_TABLES[entity].table)}
    WHERE user_id = ${userId} AND id = ${id}`.execute(tx);
  return rows[0];
};

export const createSyncRepository = (db: Kysely<Database>): SyncRepository => ({
  push: (userId, ops) =>
    db.transaction().execute(async (tx) => {
      await tx
        .insertInto('user_sync')
        .values({ user_id: userId })
        .onConflict((oc) => oc.column('user_id').doNothing())
        .execute();
      // One push per user at a time from here on: seq stays gap-free, and the
      // read-merge-write below can't interleave with another push's.
      const { last_seq: start } = await tx
        .selectFrom('user_sync')
        .select('last_seq')
        .where('user_id', '=', userId)
        .forUpdate()
        .executeTakeFirstOrThrow();

      const seen = new Set(
        ops.length === 0
          ? []
          : (
              await tx
                .selectFrom('ops')
                .select('op_id')
                .where('user_id', '=', userId)
                .where(
                  'op_id',
                  'in',
                  ops.map((op) => op.id),
                )
                .execute()
            ).map((row) => row.op_id),
      );

      let seq = start;
      for (const op of ops) {
        if (seen.has(op.id)) continue;
        // checkOp's SERVER_ENTITIES and ENTITY_TABLES must agree. If they
        // don't, failing the push beats acknowledging an op and dropping it.
        if (!isServerEntity(op.entity)) {
          throw new Error(`No server table for ${op.entity}, which passed the door.`);
        }
        seen.add(op.id);
        seq += 1;
        await tx
          .insertInto('ops')
          .values({
            user_id: userId,
            seq,
            op_id: op.id,
            entity: op.entity,
            entity_id: op.entityId,
            type: op.type,
            fields: op.type === 'set' ? JSON.stringify(op.fields) : null,
            hlc: op.hlc,
            schema_version: op.schemaVersion,
          })
          .execute();

        const current = toRowState(op.entity, await readRow(tx, userId, op.entity, op.entityId));
        const next = materialise(current, op);
        if (next.changed) {
          await writeRow(tx, userId, op.entity, op.entityId, next.row, next.deleted);
        }
      }

      if (seq !== start) {
        await tx
          .updateTable('user_sync')
          .set({ last_seq: seq })
          .where('user_id', '=', userId)
          .execute();
      }
      return { lastSeq: seq };
    }),
});
