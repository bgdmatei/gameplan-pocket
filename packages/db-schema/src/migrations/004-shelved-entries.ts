import type { Migration } from './types';

/**
 * The library's Now Playing shelf (SPEC-mobile-library.md decision 17).
 *
 * `shelved` marks the up to five games being played that the user keeps at
 * the top of the library. An ordinary synced field, so the shelf follows the
 * user across devices and merges like any other edit.
 */
export const migration004: Migration = {
  number: 4,
  name: 'shelved-entries',
  statements: [`ALTER TABLE library_entries ADD COLUMN shelved INTEGER NOT NULL DEFAULT 0`],
};
