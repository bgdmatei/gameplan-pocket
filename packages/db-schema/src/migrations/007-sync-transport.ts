import type { Migration } from './types';

/**
 * What the sync loop keeps besides the outbox (SPEC-sync-transport.md).
 *
 * `rejected_ops`: ops the server refused at the door, moved out of
 * `pending_ops` so one bad op can't block the queue forever. The payload is
 * kept, so nothing the player wrote is lost, and it goes with the database on
 * sign-out or erase like every other table. `entity` and `reason` sit beside
 * it so Debug can list rejections without reading the payload's values.
 *
 * `sync_state.last_synced_at`: when a sync last finished, for the status line.
 * `sync_state.bootstrapped`: 1 once the snapshot has been applied, so an
 * account with nothing in its log doesn't re-request the snapshot every sync.
 */
export const migration007: Migration = {
  number: 7,
  name: 'sync-transport',
  statements: [
    `CREATE TABLE rejected_ops (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      entity TEXT NOT NULL,
      reason TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      rejected_at TEXT NOT NULL
    )`,
    `ALTER TABLE sync_state ADD COLUMN last_synced_at TEXT`,
    `ALTER TABLE sync_state ADD COLUMN bootstrapped INTEGER NOT NULL DEFAULT 0`,
  ],
};
