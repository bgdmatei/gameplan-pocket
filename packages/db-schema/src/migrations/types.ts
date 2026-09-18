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

/**
 * The slice of a database connection migrations need. Declared here rather
 * than imported, so `db-schema` stays free of dependencies: any adapter that
 * runs SQL and transactions satisfies it structurally.
 */
export type MigrationExecutor = {
  execute<T = unknown>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  transaction<T>(fn: (tx: MigrationExecutor) => Promise<T>): Promise<T>;
};
