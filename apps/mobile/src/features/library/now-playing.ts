import { applyEntryChange } from '@gameplan/domain';
import type { EntryStatus } from '@gameplan/domain';
import type { StorageAdapter } from '@gameplan/storage';
import { commitLocalEdit } from '@gameplan/sync';
import type { SyncEnv } from '@gameplan/sync';

/** What holding a game on the shelf offers: each one moves it to the grid. */
export const SHELF_STATUSES = [
  'paused',
  'completed',
  'dropped',
] as const satisfies readonly EntryStatus[];

type ShelfStatusEdit = {
  entryId: string;
  status: (typeof SHELF_STATUSES)[number];
  today: string;
};

/**
 * Changes a game's status from the Now Playing shelf, as one op. Only the
 * status changes, so the platform isn't checked again.
 *
 * @throws {DomainValidationError} when the transition isn't allowed, writing nothing.
 */
export const setStatusFromShelf = async (
  adapter: StorageAdapter,
  env: SyncEnv,
  { entryId, status, today }: ShelfStatusEdit,
): Promise<void> => {
  await commitLocalEdit(adapter, env, {
    entity: 'library_entry',
    id: entryId,
    update: (current) => applyEntryChange(current, { status }, { today }),
  });
};
