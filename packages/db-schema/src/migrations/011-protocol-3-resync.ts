import type { Migration } from './types';

/**
 * Protocol 3: a synced device read the log as protocol 2, which
 * withheld note conflicts and stripped text bases, and its pull position is
 * past them. It re-reads the snapshot, its outbox on top.
 */
export const migration011: Migration = {
  number: 11,
  name: 'protocol-3-resync',
  // Only ever adds a re-sync: one already pending stays.
  statements: [`UPDATE sync_state SET resync = 1 WHERE bootstrapped = 1`],
};
