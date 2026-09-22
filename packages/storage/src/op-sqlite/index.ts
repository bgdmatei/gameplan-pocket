/**
 * The phone's database. Imported only by the mobile app: it pulls in a native
 * module, so it is deliberately kept out of the package's main entry point,
 * which Node tests and the API use.
 */
export { createOpSqliteAdapter } from './adapter';
export type { OpSqliteAdapterOptions } from './adapter';
