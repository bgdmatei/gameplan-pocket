import { SYNC_LIMITS } from '@gameplan/contracts';
import type {
  PullResponse,
  PushResponse,
  SnapshotResponse,
  SnapshotRow,
} from '@gameplan/contracts';
import { EMPTY_ROW } from '@gameplan/sync';
import type { Op, RowState } from '@gameplan/sync';
import { checkOp } from '../check';
import { materialise } from '../materialise';

type StoredRow = { entity: string; id: string; row: RowState; deleted: boolean };

type UserData = {
  log: { seq: number; op: Op }[];
  seen: Set<string>;
  rows: Map<string, StoredRow>;
};

export type MemoryServer = {
  push: (userId: string, ops: readonly unknown[]) => PushResponse;
  pull: (userId: string, query: { after: number; limit?: number }) => PullResponse;
  snapshot: (userId: string, query: { cursor?: string; limit?: number }) => SnapshotResponse;
  /** Current rows, for asserting convergence: `entity:id` → fields, live rows only. */
  rowsOf: (userId: string) => Map<string, Readonly<Record<string, unknown>>>;
};

const rowKey = (entity: string, id: string): string => `${entity}:${id}`;

type Cursor = { seq: number; after: string };

const encodeCursor = (cursor: Cursor): string => JSON.stringify(cursor);

const decodeCursor = (text: string): Cursor => {
  const value: unknown = JSON.parse(text);
  if (
    typeof value === 'object' &&
    value !== null &&
    'seq' in value &&
    'after' in value &&
    typeof value.seq === 'number' &&
    typeof value.after === 'string'
  ) {
    return { seq: value.seq, after: value.after };
  }
  throw new Error('Not a snapshot cursor.');
};

/**
 * The sync server's rules without Postgres or HTTP (ADR-023): the same door
 * checks and merge the API runs, a gap-free log per user, keyset pull, and a
 * paged snapshot. Lets the convergence property exercise the real server
 * logic in memory. Users are isolated by construction: every map is per user.
 */
export const createMemoryServer = ({ now }: { now: () => number }): MemoryServer => {
  const users = new Map<string, UserData>();

  const dataOf = (userId: string): UserData => {
    let data = users.get(userId);
    if (data === undefined) {
      data = { log: [], seen: new Set(), rows: new Map() };
      users.set(userId, data);
    }
    return data;
  };

  const push: MemoryServer['push'] = (userId, ops) => {
    const data = dataOf(userId);
    const accepted: string[] = [];
    const rejected: PushResponse['rejected'] = [];
    // One clock per push, so a batch near the drift limit isn't split by time passing.
    const nowMs = now();

    ops.forEach((raw, index) => {
      const result = checkOp(raw, nowMs);
      if (!result.ok) {
        rejected.push({ index, reason: result.reason, ...(result.opId && { opId: result.opId }) });
        return;
      }
      const { op } = result;
      accepted.push(op.id);
      // A resent op is acknowledged again but logged once.
      if (data.seen.has(op.id)) return;
      data.seen.add(op.id);
      data.log.push({ seq: data.log.length + 1, op });

      const key = rowKey(op.entity, op.entityId);
      const stored = data.rows.get(key);
      const next = materialise(stored?.row ?? EMPTY_ROW, op);
      if (next.changed) {
        data.rows.set(key, {
          entity: op.entity,
          id: op.entityId,
          row: next.row,
          deleted: next.deleted,
        });
      }
    });

    return { accepted, rejected, lastSeq: data.log.length };
  };

  const pull: MemoryServer['pull'] = (userId, { after, limit = SYNC_LIMITS.pullDefaultLimit }) => {
    const { log } = dataOf(userId);
    // seq n sits at index n - 1, so the page after `after` starts at index `after`.
    const page = log.slice(after, after + limit);
    return {
      ops: page,
      lastSeq: page.at(-1)?.seq ?? after,
      hasMore: after + page.length < log.length,
    };
  };

  const snapshot: MemoryServer['snapshot'] = (
    userId,
    { cursor, limit = SYNC_LIMITS.snapshotDefaultLimit },
  ) => {
    const data = dataOf(userId);
    const { seq, after } =
      cursor === undefined ? { seq: data.log.length, after: '' } : decodeCursor(cursor);
    const keys = [...data.rows.keys()].filter((key) => key > after).sort();
    const pageKeys = keys.slice(0, limit);
    const rows = pageKeys.map((key): SnapshotRow => {
      const stored = data.rows.get(key);
      if (stored === undefined) throw new Error(`Row ${key} vanished mid-snapshot.`);
      return {
        entity: stored.entity,
        id: stored.id,
        fields: stored.row.fields,
        fieldHlc: stored.row.clocks,
        deleted: stored.deleted,
      };
    });
    const last = pageKeys.at(-1);
    return {
      rows,
      seq,
      nextCursor:
        keys.length > limit && last !== undefined ? encodeCursor({ seq, after: last }) : null,
    };
  };

  const rowsOf: MemoryServer['rowsOf'] = (userId) =>
    new Map(
      [...dataOf(userId).rows]
        .filter(([, stored]) => !stored.deleted)
        .map(([key, stored]) => [key, stored.row.fields]),
    );

  return { push, pull, snapshot, rowsOf };
};
