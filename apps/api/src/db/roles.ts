import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type pg from 'pg';

/**
 * Least-privilege roles (SPEC-sync-transport.md): `gameplan_migrator` owns the
 * schema and runs migrations; `gameplan_app`, which the API runs as, may read
 * and write rows but never change the schema. A leaked API credential can
 * then corrupt data but not drop a table or add a backdoor function.
 *
 * Run as an administrator (the container's superuser, Neon's owner role), not
 * as either role. Every statement is safe to run again.
 */
export const MIGRATOR_ROLE = 'gameplan_migrator';
export const APP_ROLE = 'gameplan_app';

type Admin = Pick<pg.Client, 'query' | 'escapeLiteral' | 'escapeIdentifier'>;

/** Creates both login roles, or resets their passwords. Roles are cluster-wide. */
export const createRoles = async (
  admin: Admin,
  passwords: { migrator: string; app: string },
): Promise<void> => {
  for (const [role, password] of [
    [MIGRATOR_ROLE, passwords.migrator],
    [APP_ROLE, passwords.app],
  ] as const) {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
    // CREATE ROLE takes no bind parameters, so the password is escaped instead.
    const verb = rowCount === 0 ? 'CREATE' : 'ALTER';
    await admin.query(`${verb} ROLE ${role} LOGIN PASSWORD ${admin.escapeLiteral(password)}`);
  }
};

/**
 * Grants for one database (privileges are per database). Run it before or
 * after migrations: it hands any existing tables to the migrator, and default
 * privileges cover every table the migrator creates from then on.
 */
export const grantRoles = async (admin: Admin, database: string): Promise<void> => {
  const db = admin.escapeIdentifier(database);
  const statements = [
    // Lets the administrator act for the migrator: hand it tables and set its
    // default privileges (Postgres 16+ asks for membership, not just admin).
    `GRANT ${MIGRATOR_ROLE} TO CURRENT_USER`,
    // CREATE on the database for trusted extensions (pg_trgm in 001).
    `GRANT CONNECT, CREATE ON DATABASE ${db} TO ${MIGRATOR_ROLE}`,
    `GRANT CONNECT ON DATABASE ${db} TO ${APP_ROLE}`,
    `REVOKE CREATE ON SCHEMA public FROM PUBLIC`,
    `GRANT USAGE, CREATE ON SCHEMA public TO ${MIGRATOR_ROLE}`,
    `GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`,
    // Tables made before the roles existed (001 and 002 on staging).
    `DO $$
     DECLARE t record;
     BEGIN
       FOR t IN SELECT tablename FROM pg_tables
                WHERE schemaname = 'public' AND tableowner <> '${MIGRATOR_ROLE}'
       LOOP
         EXECUTE format('ALTER TABLE public.%I OWNER TO ${MIGRATOR_ROLE}', t.tablename);
       END LOOP;
     END $$`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE}`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${MIGRATOR_ROLE} IN SCHEMA public
       GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_ROLE}`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${MIGRATOR_ROLE} IN SCHEMA public
       GRANT USAGE, SELECT ON SEQUENCES TO ${APP_ROLE}`,
  ];
  for (const statement of statements) await admin.query(statement);
};

/**
 * The API refuses to start unless it logged in as `gameplan_app` and can't
 * change the schema: a DATABASE_URL pointing at the migrator or the owner
 * (directly, or switched with SET ROLE) would otherwise run with DDL rights,
 * and nothing would show it.
 */
export const assertAppRole = async <T>(db: Kysely<T>, name = 'DATABASE_URL'): Promise<void> => {
  const { rows } = await sql<{ login: string; ddl: boolean }>`
    SELECT session_user AS login,
           has_schema_privilege('public', 'CREATE')
             OR (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS ddl
  `.execute(db);
  const login = rows[0]?.login;
  if (login !== APP_ROLE) {
    throw new Error(`${name} connects as ${String(login)}, not ${APP_ROLE}. Refusing to start.`);
  }
  if (rows[0]?.ddl !== false) {
    throw new Error(`${APP_ROLE} can change the schema. Refusing to start.`);
  }
};
