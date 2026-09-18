/**
 * A migration is a list of SQL statements, not one blob of SQL, because
 * splitting SQL reliably needs a parser: trigger bodies contain semicolons.
 * Statements are also TypeScript strings rather than .sql files, since this
 * package runs on the phone where there is no filesystem to read from.
 */
export type Migration = {
  /** Applied in ascending order; also the value written to `user_version`. */
  number: number;
  name: string;
  statements: readonly string[];
};

/** Anything that can run one statement. */
export type SqlRunner = {
  execute<T = unknown>(sql: string, params?: readonly unknown[]): Promise<T[]>;
};

/**
 * The slice of a database connection migrations need. Declared here rather
 * than imported, so `db-schema` stays free of dependencies: any adapter that
 * runs SQL and transactions satisfies it structurally.
 *
 * The transaction callback receives a plain runner, not another executor, so
 * that a real adapter — whose transactions hand back something that cannot
 * itself start a transaction — matches this type.
 */
export type MigrationExecutor = SqlRunner & {
  transaction<T>(fn: (tx: SqlRunner) => Promise<T>): Promise<T>;
};
