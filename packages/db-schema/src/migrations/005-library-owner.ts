import type { Migration } from './types';

/**
 * Which account this phone's library belongs to (SPEC-auth-identity.md
 * decision 12). Null until the first sign-in claims it.
 *
 * Kept in the database rather than the secure store, so it is destroyed with
 * the library it describes: owner and data can never disagree. A sign-in as a
 * different account is refused while the library has another owner (decision 6).
 * Device-local, like the rest of `sync_state`: it never syncs.
 */
export const migration005: Migration = {
  number: 5,
  name: 'library-owner',
  statements: [`ALTER TABLE sync_state ADD COLUMN owner_user_id TEXT`],
};
