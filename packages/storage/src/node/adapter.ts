import { DatabaseSync } from 'node:sqlite';
import type {
  NodeAdapterOptions,
  SqlParams,
  SqlValue,
  StorageAdapter,
  Transaction,
  Unsubscribe,
} from '../adapter';
import { tablesWritten } from '../sql-tables';

type Subscription = { tables: ReadonlySet<string>; listener: () => void };

/** SQLite rejects JavaScript booleans, and `undefined` would bind as null. */
const toBindable = (value: SqlValue | undefined, index: number): SqlValue => {
  if (value === undefined) {
    throw new Error(
      `Parameter ${index + 1} is undefined. Pass null to store nothing, so a forgotten value fails here rather than silently.`,
    );
  }

  // A NUL character ends a C string, so SQLite stores everything before it and
  // silently drops the rest. Refuse it instead: truncated data is far harder to
  // notice than a failed write. (The domain's tag identity key contains one,
  // which is why it is hashed into an id rather than stored.)
  if (typeof value === 'string' && value.includes('\u0000')) {
    throw new Error(
      `Parameter ${index + 1} contains a NUL character, which SQLite would truncate the value at.`,
    );
  }

  return typeof value === 'boolean' ? Number(value) : value;
};

/** Rows arrive with a null prototype, which surprises callers and test matchers. */
const toPlainObject = <T>(row: unknown): T => ({ ...(row as object) }) as T;

/**
 * The database used by tests and CI. It is not what ships: the phone uses
 * op-sqlite. Both are held to the same suite (`./testing/adapter-suite`), which
 * is what stops them drifting apart.
 */
export const createNodeAdapter = (options: NodeAdapterOptions = {}): StorageAdapter => {
  const database = new DatabaseSync(options.path ?? ':memory:');
  const subscriptions = new Set<Subscription>();

  let closed = false;
  let inTransaction = false;
  /** Tables written since the current transaction began. */
  let pendingTables = new Set<string>();

  database.exec('PRAGMA foreign_keys = ON');
  // WAL lets reads continue while a write is in flight. It is a no-op for
  // in-memory databases, which have no journal file.
  if (options.path !== undefined) database.exec('PRAGMA journal_mode = WAL');

  const assertOpen = (): void => {
    if (closed) throw new Error('This database is closed.');
  };

  const notify = (tables: ReadonlySet<string>): void => {
    if (tables.size === 0) return;

    for (const { tables: watched, listener } of subscriptions) {
      if (![...tables].some((table) => watched.has(table))) continue;
      try {
        listener();
      } catch {
        // One screen's failure must not stop the others being told.
      }
    }
  };

  const run = async <T>(sql: string, params: SqlParams = []): Promise<T[]> => {
    assertOpen();

    const bound = params.map(toBindable);

    let rows: unknown[];
    try {
      rows = database.prepare(sql).all(...(bound as never[]));
    } catch (cause) {
      throw new Error(`SQL failed: ${sql}`, { cause });
    }

    const written = tablesWritten(sql);
    if (written.length > 0) {
      if (inTransaction) {
        for (const table of written) pendingTables.add(table);
      } else {
        notify(new Set(written));
      }
    }

    return rows.map((row) => toPlainObject<T>(row));
  };

  const transaction = async <T>(fn: (tx: Transaction) => Promise<T>): Promise<T> => {
    assertOpen();
    if (inTransaction) {
      throw new Error(
        'Nested transactions are not supported: SQLite has no inner commit, so the inner one would appear to succeed while the outer one could still roll everything back.',
      );
    }

    inTransaction = true;
    pendingTables = new Set();
    database.exec('BEGIN');

    try {
      const result = await fn({ execute: run });
      database.exec('COMMIT');
      const changed = pendingTables;
      inTransaction = false;
      notify(changed);
      return result;
    } catch (error) {
      database.exec('ROLLBACK');
      inTransaction = false;
      throw error;
    }
  };

  return {
    execute: run,
    transaction,
    subscribe: (tables: readonly string[], listener: () => void): Unsubscribe => {
      const subscription: Subscription = { tables: new Set(tables), listener };
      subscriptions.add(subscription);
      return () => {
        subscriptions.delete(subscription);
      };
    },
    close: async (): Promise<void> => {
      if (closed) return;
      closed = true;
      subscriptions.clear();
      database.close();
    },
  };
};
