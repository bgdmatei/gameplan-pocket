/**
 * Values SQLite can store. Booleans are accepted for convenience and bound as
 * 0 or 1; `undefined` is rejected, so a forgotten field fails loudly instead of
 * quietly becoming null.
 */
export type SqlValue = string | number | boolean | null | Uint8Array;

export type SqlParams = readonly SqlValue[];

/** Runs statements inside an open transaction. */
export type Transaction = {
  execute<T = Record<string, unknown>>(sql: string, params?: SqlParams): Promise<T[]>;
};

export type Unsubscribe = () => void;

/**
 * The contract every database implementation meets: op-sqlite on the phone,
 * node:sqlite in tests, SQLite compiled to WebAssembly in the browser later.
 * Nothing above this layer knows which one it is talking to.
 *
 * Implementations are held to `runAdapterSuite` in `./testing`, which is the
 * real definition of this contract.
 */
export type StorageAdapter = Transaction & {
  /**
   * Runs `fn` inside one transaction: commits when it returns, rolls back when
   * it throws. Nested calls are refused rather than silently flattened, since
   * SQLite has no nested transactions and the inner "commit" would be a lie.
   */
  transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;

  /**
   * Calls `listener` after a write to any of `tables` commits. Never fires
   * mid-transaction and never after a rollback, so a screen cannot read a
   * half-written state. Returns a function that stops delivery.
   */
  subscribe(tables: readonly string[], listener: () => void): Unsubscribe;

  /** Closes the database. Safe to call more than once. */
  close(): Promise<void>;

  /**
   * Closes the database and destroys its contents.
   *
   * This is the sign-out path. Everything here is personal: what someone
   * plays, how they rate it, and notes they wrote while playing. Signing out
   * on a shared or borrowed device has to leave none of it behind, and simply
   * closing the connection leaves the whole library on disk for whoever opens
   * the app next.
   *
   * Afterwards the adapter is closed: a caller that wants a fresh database
   * creates a new one, which migrations then rebuild empty.
   */
  destroy(): Promise<void>;
};

export type NodeAdapterOptions = {
  /** Defaults to an in-memory database, which is what tests want. */
  path?: string;
};
