import pg from 'pg';
import { createRoles, grantRoles, APP_ROLE, MIGRATOR_ROLE } from '../db/roles';
import { loadDotEnv } from '../env';

/**
 * `pnpm --filter api db:roles`: creates `gameplan_migrator` and `gameplan_app`
 * and grants them on one database. Run once per database as its owner (the
 * Docker superuser locally, Neon's owner role on staging), and again after
 * changing a role's password. Safe to repeat.
 *
 * Reads ADMIN_DATABASE_URL (the owner), plus MIGRATION_DATABASE_URL and
 * DATABASE_URL, whose user and password become the two roles' logins, so
 * each password is written down once.
 */
loadDotEnv();

const credentialOf = (name: string, role: string): string => {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} is not set.`);
  const url = new URL(value);
  if (url.username !== role) throw new Error(`${name} must connect as ${role}.`);
  if (url.password === '') throw new Error(`${name} has no password.`);
  return decodeURIComponent(url.password);
};

const adminUrl = process.env['ADMIN_DATABASE_URL'];
if (adminUrl === undefined || adminUrl === '') throw new Error('ADMIN_DATABASE_URL is not set.');
const database = decodeURIComponent(new URL(adminUrl).pathname.slice(1));

const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
try {
  await createRoles(admin, {
    migrator: credentialOf('MIGRATION_DATABASE_URL', MIGRATOR_ROLE),
    app: credentialOf('DATABASE_URL', APP_ROLE),
  });
  await grantRoles(admin, database);
  console.warn(`Roles ready on ${database}. Now run: pnpm --filter api migrate`);
} finally {
  await admin.end();
}
