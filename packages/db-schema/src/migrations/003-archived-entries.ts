import type { Migration } from './types';

/**
 * Games are archived, never deleted (SPEC-domain-model.md decision 12).
 *
 * `archived` hides a game from the library while keeping its notes, rating and
 * dates. It is an ordinary synced field, so archiving on one device and editing
 * on another merge like any other two edits. The `deleted` column stays for
 * the table's shape but is never set for an entry any more.
 */
export const migration003: Migration = {
  number: 3,
  name: 'archived-entries',
  statements: [`ALTER TABLE library_entries ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`],
};
