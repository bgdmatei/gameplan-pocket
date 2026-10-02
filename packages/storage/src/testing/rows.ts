import type { StorageAdapter } from '../adapter';
import type { SyncedRowCodec } from '../repositories/synced-rows';
import { writeRows } from '../repositories/write';

/**
 * Writes rows straight to a table, with empty clocks and no op: fixtures for
 * tests and the seed, which need data on disk rather than edits to sync.
 *
 * Never for a user's edit. Those go through `sync-core`'s commit functions, or
 * the row carries no clocks and the change never leaves the device.
 */
export const putRows = async <T>(
  adapter: StorageAdapter,
  { table, toRow }: SyncedRowCodec<T>,
  values: readonly T[],
  { now, deleted = false }: { now: string; deleted?: boolean },
): Promise<void> => {
  await adapter.transaction((tx) =>
    writeRows(tx, {
      rows: values.map((value) => ({ table, row: toRow(value, { fieldHlc: '{}', deleted, now }) })),
    }),
  );
};
