import type { Migration } from './types';

/**
 * The player's theme choice: 'auto' (follow the phone), 'light' or 'dark'
 * (SPEC-visual-design.md, 2026-10-23). Device-local, like the rest of
 * `sync_state`: it never syncs, and it goes with the database on sign-out or
 * erase, falling back to 'auto'.
 */
export const migration006: Migration = {
  number: 6,
  name: 'theme',
  statements: [`ALTER TABLE sync_state ADD COLUMN theme TEXT NOT NULL DEFAULT 'auto'`],
};
