import type { Migration } from './types';

export const migration009: Migration = {
  number: 9,
  name: 'rating-scale',
  statements: [
    `UPDATE library_entries SET rating = rating * 10 WHERE rating IS NOT NULL`,
    // A synced device may hold values it received downcast; it re-reads the snapshot (ADR-017).
    `ALTER TABLE sync_state ADD COLUMN resync INTEGER NOT NULL DEFAULT 0`,
    `UPDATE sync_state SET resync = bootstrapped`,
  ],
};
