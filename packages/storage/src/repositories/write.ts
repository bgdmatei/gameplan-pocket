import type { SqlValue, StorageAdapter } from '../adapter';

export type Row = Readonly<Record<string, SqlValue>>;

export type RowWrite = {
  table: string;
  /** Full row, including `id` and `field_hlc`. */
  row: Row;
};

/**
 * One entry for the outbox. `payload` is opaque: `sync-core` owns the format,
 * storage keeps insertion order and hands it back untouched.
 */
export type PendingOp = {
  id: string;
  payload: string;
  createdAt: string;
};

export type AtomicWrite = {
  rows: readonly RowWrite[];
  /** Local edits carry ops; rows applied from a sync pull do not. */
  ops?: readonly PendingOp[];
};

/** `INSERT … ON CONFLICT (id) DO UPDATE`, so a save works for new and existing rows. */
const buildUpsert = (table: string, row: Row): { sql: string; params: SqlValue[] } => {
  const columns = Object.keys(row);
  const placeholders = columns.map(() => '?').join(', ');
  const updates = columns
    .filter((column) => column !== 'id')
    .map((column) => `${column} = excluded.${column}`)
    .join(', ');

  if (updates.length === 0) {
    throw new Error(`A row for ${table} needs more than an id to be worth writing.`);
  }

  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})
     ON CONFLICT (id) DO UPDATE SET ${updates}`;

  return { sql, params: columns.map((column) => row[column] as SqlValue) };
};

/**
 * Writes rows and their outbox entries in a single transaction.
 *
 * Every local edit goes through here, because the row and the operation that
 * tells other devices about it must not be separable: a row saved without its
 * operation would never sync, and an operation without its row would tell other
 * devices about a change this device does not have. If the app is killed
 * halfway, SQLite leaves neither behind.
 */
export const writeAtomically = async (
  adapter: StorageAdapter,
  { rows, ops = [] }: AtomicWrite,
): Promise<void> => {
  await adapter.transaction(async (tx) => {
    for (const { table, row } of rows) {
      const { sql, params } = buildUpsert(table, row);
      await tx.execute(sql, params);
    }

    for (const op of ops) {
      await tx.execute('INSERT INTO pending_ops (id, payload, created_at) VALUES (?, ?, ?)', [
        op.id,
        op.payload,
        op.createdAt,
      ]);
    }
  });
};
