import { MIGRATIONS } from './migrations/index';
import type { Migration, MigrationExecutor } from './migrations/types';

export type MigrationResult = {
  /** Version the database was on before this run. */
  from: number;
  /** Version it is on now. */
  to: number;
  /** Migrations applied, in order. Empty when the database was up to date. */
  applied: readonly number[];
};

const readVersion = async (executor: MigrationExecutor): Promise<number> => {
  const rows = await executor.execute<{ user_version: number }>('PRAGMA user_version');
  return rows[0]?.user_version ?? 0;
};

/**
 * Checked before anything runs, because a bad list fails silently otherwise: a
 * migration numbered 0 is simply never newer than the current version, and a
 * duplicate number means the second one never runs and its tables never exist.
 */
const assertUsableList = (migrations: readonly Migration[]): void => {
  const seen = new Set<number>();

  for (const { number } of migrations) {
    if (!Number.isSafeInteger(number) || number < 1) {
      throw new Error(`Migration number must be a positive integer: ${String(number)}`);
    }
    if (seen.has(number)) {
      throw new Error(`Two migrations share the number ${number}`);
    }
    seen.add(number);
  }
};

const applyMigration = async (executor: MigrationExecutor, migration: Migration): Promise<void> => {
  await executor.transaction(async (tx) => {
    for (const statement of migration.statements) {
      await tx.execute(statement);
    }
    // PRAGMA takes no parameters, so the number is interpolated. It never comes
    // from input, and assertUsableList has checked it is a whole number.
    await tx.execute(`PRAGMA user_version = ${migration.number}`);
  });
};

/**
 * Brings a database up to the latest schema version.
 *
 * Each migration runs inside its own transaction together with its version
 * bump, so a failure leaves the database exactly where it was: either the
 * whole migration and the new version land, or neither does. Running this on
 * an up-to-date database does nothing.
 */
export const migrate = async (
  executor: MigrationExecutor,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<MigrationResult> => {
  assertUsableList(migrations);

  const from = await readVersion(executor);
  const pending = [...migrations]
    .sort((a, b) => a.number - b.number)
    .filter((migration) => migration.number > from);

  for (const migration of pending) {
    await applyMigration(executor, migration);
  }

  return { from, to: await readVersion(executor), applied: pending.map(({ number }) => number) };
};
