import type { SqlValue, Transaction } from '../adapter';

export const SYNC_STATE_TABLES = ['sync_state'] as const;

/** 'auto' follows the phone's setting; the others pin the app to one theme. */
export const THEME_PREFERENCES = ['auto', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

const isThemePreference = (value: unknown): value is ThemePreference =>
  THEME_PREFERENCES.some((theme) => theme === value);

/**
 * Where this device is up to. One row, created by the first migration.
 *
 * `lastPulledSeq` is the cursor into the server's log; it must be written in
 * the same transaction as the ops it covers, or a crash between the two would
 * either skip changes or apply them twice.
 */
export type SyncState = {
  /** Identifies this device in clocks and ids. Null until registered. */
  nodeId: string | null;
  lastPulledSeq: number;
  /** Last clock value this device issued, opaque to storage. */
  hlcLast: string | null;
  schemaVersion: number;
  catalogVersion: number;
  /** The account this library belongs to; null until the first sign-in claims it. */
  ownerUserId: string | null;
  /** The player's theme choice (migration 006). */
  theme: ThemePreference;
};

export type SyncStatePatch = Partial<SyncState>;

type SyncStateRow = {
  node_id: string | null;
  last_pulled_seq: number;
  hlc_last: string | null;
  schema_version: number;
  catalog_version: number;
  owner_user_id: string | null;
  theme: string;
};

const COLUMNS: Record<keyof SyncState, string> = {
  nodeId: 'node_id',
  lastPulledSeq: 'last_pulled_seq',
  hlcLast: 'hlc_last',
  schemaVersion: 'schema_version',
  catalogVersion: 'catalog_version',
  ownerUserId: 'owner_user_id',
  theme: 'theme',
};

/** Takes a transaction too, so a write can read and advance the clock atomically. */
export const getSyncState = async (adapter: Transaction): Promise<SyncState> => {
  const rows = await adapter.execute<SyncStateRow>(
    `SELECT node_id, last_pulled_seq, hlc_last, schema_version, catalog_version, owner_user_id,
            theme
     FROM sync_state WHERE id = 1`,
  );
  const row = rows[0];

  if (row === undefined) {
    throw new Error('sync_state is missing its only row; the database has not been migrated.');
  }

  return {
    nodeId: row.node_id,
    lastPulledSeq: row.last_pulled_seq,
    hlcLast: row.hlc_last,
    schemaVersion: row.schema_version,
    catalogVersion: row.catalog_version,
    ownerUserId: row.owner_user_id,
    // Only updateSyncState writes it, and it refuses anything else; 'auto' is the safe reading.
    theme: isThemePreference(row.theme) ? row.theme : 'auto',
  };
};

/**
 * Updates only the fields given. A sequence that went backwards or arrived
 * fractional would silently re-apply or skip changes, so both are refused here
 * rather than stored.
 */
export const updateSyncState = async (
  adapter: Transaction,
  patch: SyncStatePatch,
): Promise<void> => {
  for (const field of ['lastPulledSeq', 'schemaVersion', 'catalogVersion'] as const) {
    const value = patch[field];
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
      throw new Error(`${field} must be a whole number of 0 or more, got ${String(value)}`);
    }
  }

  if (patch.theme !== undefined && !isThemePreference(patch.theme)) {
    throw new Error(
      `theme must be one of ${THEME_PREFERENCES.join(', ')}, got ${String(patch.theme)}`,
    );
  }

  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return;

  const assignments = entries
    .map(([field]) => `${COLUMNS[field as keyof SyncState]} = ?`)
    .join(', ');

  await adapter.execute(`UPDATE sync_state SET ${assignments} WHERE id = 1`, [
    ...entries.map(([, value]) => value as SqlValue),
  ]);
};
