import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './schema';

const { builtins } = pg.types;

/**
 * Two of `pg`'s default conversions are wrong for us, so this pool overrides
 * them (and only this pool: nothing global is changed):
 * - DATE would become a JS `Date` at local midnight, shifting the day in some
 *   timezones. The domain wants the `YYYY-MM-DD` text as stored.
 * - BIGINT would become a string, to be safe past 2^53. Catalog versions stay
 *   far below that, so a number is correct and simpler.
 */
const typeParsers = {
  getTypeParser: ((oid: number, format?: 'text' | 'binary') => {
    if (oid === builtins.DATE) return (value: string) => value;
    if (oid === builtins.INT8) return (value: string) => Number(value);
    return pg.types.getTypeParser(oid, format);
  }) as typeof pg.types.getTypeParser,
};

export const createDb = (connectionString: string): Kysely<Database> =>
  new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString, types: typeParsers }),
    }),
  });
