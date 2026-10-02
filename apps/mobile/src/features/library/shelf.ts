import { DomainValidationError, applyEntryChange } from '@gameplan/domain';
import { SHELF_SIZE, listShelf } from '@gameplan/storage';
import type { StorageAdapter } from '@gameplan/storage';
import { commitLocalEdit } from '@gameplan/sync';
import type { SyncEnv } from '@gameplan/sync';

type ShelfEdit = { entryId: string; today: string };

const setShelved = (adapter: StorageAdapter, env: SyncEnv, edit: ShelfEdit, shelved: boolean) =>
  commitLocalEdit(adapter, env, {
    entity: 'library_entry',
    id: edit.entryId,
    update: (current) => applyEntryChange(current, { shelved }, { today: edit.today }),
  });

/**
 * Puts a game being played on the Now Playing shelf. The domain refuses a game
 * not being played; the size limit is checked here, since it needs the other
 * entries. Local writes only: a merge may still leave more than five shelved,
 * and the shelf then shows the first five.
 *
 * @throws {DomainValidationError} when the shelf is full or the game isn't
 * being played, writing nothing.
 */
export const shelveGame = async (
  adapter: StorageAdapter,
  env: SyncEnv,
  edit: ShelfEdit,
): Promise<void> => {
  const shelf = await listShelf(adapter);
  if (shelf.some((game) => game.id === edit.entryId)) return;
  if (shelf.length >= SHELF_SIZE) {
    throw new DomainValidationError([
      {
        code: 'invalid_field',
        field: 'shelved',
        message: `The shelf holds ${String(SHELF_SIZE)} games. Take one off first.`,
      },
    ]);
  }
  await setShelved(adapter, env, edit, true);
};

export const unshelveGame = async (
  adapter: StorageAdapter,
  env: SyncEnv,
  edit: ShelfEdit,
): Promise<void> => {
  await setShelved(adapter, env, edit, false);
};
