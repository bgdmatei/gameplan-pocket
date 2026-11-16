import { materialise } from '@gameplan/sync-server';
import type { PullQuery, PullResponse, SnapshotRow } from '@gameplan/contracts';
import type { Op, RowState } from '@gameplan/sync';
import { sql } from 'kysely';
import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../db/schema';
import { ENTITY_TABLES, isServerEntity } from './columns';
import type { ServerEntity } from './columns';
import { SNAPSHOT_ORDER } from './cursor';
import type { SnapshotCursor } from './cursor';

export type SyncRepository = {
  /**
   * Logs and merges ops that already passed the door, in one transaction.
   * Ops already logged (same op id) are skipped. Returns the user's log
   * position afterwards.
   */
  push: (userId: string, ops: readonly Op[]) => Promise<{ lastSeq: number }>;
  /** Up to `limit` ops after `after`, oldest first. */
  pull: (userId: string, query: PullQuery) => Promise<PullResponse>;
  /**
   * One page of the user's current rows, ordered by (entity, id). Without a
   * cursor it starts a snapshot at the user's current log position.
   */
  snapshot: (
    userId: string,
    query: { cursor: SnapshotCursor | undefined; limit: number },
  ) => Promise<{ rows: SnapshotRow[]; seq: number; next: SnapshotCursor | null }>;
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

/** A logged op back in its wire shape, exactly as the device sent it. */
const opOf = (row: {
  op_id: string;
  entity: string;
  entity_id: string;
  type: string;
  fields: unknown;
  hlc: string;
  schema_version: number;
}): Record<string, unknown> => ({
  id: row.op_id,
  entity: row.entity,
  entityId: row.entity_id,
  type: row.type,
  ...(row.type === 'set' && { fields: row.fields }),
  hlc: row.hlc,
  schemaVersion: row.schema_version,
});

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

  pull: async (userId, { after, limit }) => {
    // One extra row says whether there is more, without a count.
    const rows = await db
      .selectFrom('ops')
      .select(['seq', 'op_id', 'entity', 'entity_id', 'type', 'fields', 'hlc', 'schema_version'])
      .where('user_id', '=', userId)
      .where('seq', '>', after)
      .orderBy('seq')
      .limit(limit + 1)
      .execute();
    const page = rows.slice(0, limit);
    return {
      ops: page.map((row) => ({ seq: row.seq, op: opOf(row) })),
      lastSeq: page.at(-1)?.seq ?? after,
      hasMore: rows.length > limit,
    };
  },

  snapshot: async (userId, { cursor, limit }) => {
    const seq =
      cursor?.seq ??
      (
        await db
          .selectFrom('user_sync')
          .select('last_seq')
          .where('user_id', '=', userId)
          .executeTakeFirst()
      )?.last_seq ??
      0;

    // Keyset over (entity, id): the rest of the cursor's table, then each
    // later table from the start. One extra row says whether there is more.
    const rows: { entity: ServerEntity; row: SnapshotRow }[] = [];
    const start = cursor === undefined ? 0 : SNAPSHOT_ORDER.indexOf(cursor.entity);
    for (const entity of SNAPSHOT_ORDER.slice(start)) {
      const after = cursor?.entity === entity ? cursor.id : undefined;
      const { rows: found } = await sql<Row>`
        SELECT * FROM ${sql.table(ENTITY_TABLES[entity].table)}
        WHERE user_id = ${userId} ${after === undefined ? sql`` : sql`AND id > ${after}`}
        ORDER BY id
        LIMIT ${limit + 1 - rows.length}`.execute(db);
      for (const row of found) {
        const state = toRowState(entity, row);
        rows.push({
          entity,
          row: {
            entity,
            id: String(row['id']),
            fields: state.fields,
            fieldHlc: state.clocks,
            deleted: row['deleted'] === true,
          },
        });
      }
      if (rows.length > limit) break;
    }

    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      rows: page.map(({ row }) => row),
      seq,
      next:
        rows.length > limit && last !== undefined
          ? { seq, entity: last.entity, id: last.row.id }
          : null,
    };
  },
});
