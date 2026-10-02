import { applyEntryChange } from '@gameplan/domain';
import type { EntryPatch } from '@gameplan/domain';
import type { StorageAdapter } from '@gameplan/storage';
import { commitLocalEdit } from '@gameplan/sync';
import type { SyncEnv } from '@gameplan/sync';

export type EntryEdit = {
  entryId: string;
  patch: EntryPatch;
  today: string;
  /** The game's platforms, so a platform it doesn't run on is refused. */
  gamePlatformIds: readonly number[];
};

/**
 * Every editor control saves through here: one field, one domain check, one
 * op. The domain rule runs against the row as stored, inside the transaction,
 * so a patch the screen should never have offered is still refused.
 *
 * Returns `false` when nothing changed, so re-saving a value adds no op.
 *
 * @throws {DomainValidationError} with every reason, and writes nothing.
 */
export const editEntry = async (
  adapter: StorageAdapter,
  env: SyncEnv,
  { entryId, patch, today, gamePlatformIds }: EntryEdit,
): Promise<boolean> => {
  const op = await commitLocalEdit(adapter, env, {
    entity: 'library_entry',
    id: entryId,
    update: (current) => applyEntryChange(current, patch, { today, gamePlatformIds }),
  });
  return op !== null;
};
