import { open } from '@op-engineering/op-sqlite';
import type { DB, Scalar } from '@op-engineering/op-sqlite';
import type {
  NotifyScheduler,
  SqlParams,
  SqlValue,
  StorageAdapter,
  Transaction,
  Unsubscribe,
} from '../adapter';
import { createSerialQueue } from '../serial-queue';
import { tablesWritten } from '../sql-tables';

export type OpSqliteAdapterOptions = {
  /** File name inside the app's storage. */
  name?: string;
  scheduleNotify?: NotifyScheduler;
};

type Subscription = { tables: ReadonlySet<string>; listener: () => void };

/**
 * Same reasons as the node implementation: SQLite rejects JavaScript booleans,
 * `undefined` would bind as null, and a NUL character would truncate the value
 * silently.
 */
const toBindable = (value: SqlValue | undefined, index: number): Scalar => {
  if (value === undefined) {
    throw new Error(
      `Parameter ${String(index + 1)} is undefined. Pass null to store nothing, so a forgotten value fails here rather than silently.`,
    );
  }

  if (typeof value === 'string' && value.includes('\u0000')) {
    throw new Error(
      `Parameter ${String(index + 1)} contains a NUL character, which SQLite would truncate the value at.`,
    );
  }

  return (typeof value === 'boolean' ? Number(value) : value) as Scalar;
};

const toPlainObject = <T>(row: unknown): T => ({ ...(row as object) }) as T;

/**
 * The database the app actually ships with: SQLite through op-sqlite's JSI
 * bridge, which runs off the JavaScript thread.
 *
 * Held to the same contract as the test implementation
 * (`../testing/cases.ts`), which is what stops the two drifting apart. The
 * debug screen in the app runs those cases against this adapter on a real
 * device, since no test runner exists there.
 */
export const createOpSqliteAdapter = (options: OpSqliteAdapterOptions = {}): StorageAdapter => {
  const database: DB = open({ name: options.name ?? 'gameplan.db' });
  const subscriptions = new Set<Subscription>();
  // One transaction at a time; a query outside one waits for it to commit.
  const queue = createSerialQueue();

  let closed = false;
  let inTransaction = false;
  let pendingTables = new Set<string>();
  let unnotifiedTables = new Set<string>();
  let flushScheduled = false;

  // One frame: React Native provides requestAnimationFrame, so a burst of
  // writes repaints the screen once rather than per commit. Reached through
  // globalThis because this package deliberately has no React Native types.
  const scheduleNotify: NotifyScheduler =
    options.scheduleNotify ??
    ((flush) => {
      const onNextFrame = (globalThis as { requestAnimationFrame?: (cb: () => void) => void })
        .requestAnimationFrame;

      if (typeof onNextFrame === 'function') onNextFrame(flush);
      else setTimeout(flush, 16);
    });

  // Reads stay consistent while a write is in flight, and foreign keys are off
  // by default in SQLite.
  database.executeSync('PRAGMA journal_mode = WAL');
  database.executeSync('PRAGMA foreign_keys = ON');

  const assertOpen = (): void => {
    if (closed) throw new Error('This database is closed.');
  };

  const deliver = (tables: ReadonlySet<string>): void => {
    for (const { tables: watched, listener } of subscriptions) {
      if (![...tables].some((table) => watched.has(table))) continue;
      try {
        listener();
      } catch {
        // One screen's failure must not stop the others being told.
      }
    }
  };

  const notify = (tables: ReadonlySet<string>): void => {
    if (tables.size === 0) return;
    for (const table of tables) unnotifiedTables.add(table);

    if (flushScheduled) return;
    flushScheduled = true;

    scheduleNotify(() => {
      flushScheduled = false;
      const changed = unnotifiedTables;
      unnotifiedTables = new Set();
      if (changed.size > 0) deliver(changed);
    });
  };

  const trackWrites = (sql: string): void => {
    const written = tablesWritten(sql);
    if (written.length === 0) return;

    if (inTransaction) {
      for (const table of written) pendingTables.add(table);
    } else {
      notify(new Set(written));
    }
  };

  const run = async <T>(sql: string, params: SqlParams = []): Promise<T[]> => {
    assertOpen();
    const bound = params.map(toBindable);

    let rows: unknown[];
    try {
      const result = await database.execute(sql, bound);
      rows = result.rows;
    } catch (cause) {
      throw new Error(`SQL failed: ${sql}`, { cause });
    }

    trackWrites(sql);
    return rows.map((row) => toPlainObject<T>(row));
  };

  const transaction = async <T>(fn: (tx: Transaction) => Promise<T>): Promise<T> =>
    queue.run(async () => {
      assertOpen();
      inTransaction = true;
      pendingTables = new Set();

      // op-sqlite's transaction resolves to nothing, so the callback's value
      // comes back through this. Wrapped rather than left bare so "never ran"
      // is distinguishable from "returned undefined".
      let outcome: { value: T } | undefined;

      try {
        await database.transaction(async (tx) => {
          const value = await fn({
            execute: async <R>(sql: string, params: SqlParams = []): Promise<R[]> => {
              const queryResult = await tx.execute(sql, params.map(toBindable));
              trackWrites(sql);
              return queryResult.rows.map((row) => toPlainObject<R>(row));
            },
          });

          outcome = { value };
        });
      } catch (error) {
        inTransaction = false;
        throw error;
      }

      const changed = pendingTables;
      inTransaction = false;

      if (outcome === undefined) {
        throw new Error('The transaction finished without running its callback.');
      }

      notify(changed);
      return outcome.value;
    });

  return {
    execute: async <T>(sql: string, params?: SqlParams): Promise<T[]> =>
      queue.run(() => run<T>(sql, params)),
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
    destroy: async (): Promise<void> => {
      if (closed) return;
      closed = true;
      subscriptions.clear();
      // Removes the file, not just its contents: signing out on a shared
      // device must leave nothing behind.
      database.delete();
    },
  };
};
