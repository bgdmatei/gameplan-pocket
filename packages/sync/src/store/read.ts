import { readSyncedRow } from '@gameplan/storage';
import type { Transaction } from '@gameplan/storage';
import { codecFor, parseClocks } from './entities';
import type { EntityValues, StoredEntity } from './entities';

/**
 * The clock of one field as this device holds it, or `null` when the row or
 * the clock doesn't exist.
 *
 * A note editor reads the text's clock when it opens and sends it as
 * `baseHlc` with every save of that session: the version the user started
 * from, which is what `notes-conflicts` (module 10) compares against.
 */
export const readFieldClock = async <E extends StoredEntity>(
  db: Transaction,
  entity: E,
  id: string,
  field: keyof EntityValues[E] & string,
): Promise<string | null> => {
  const stored = await readSyncedRow(db, codecFor(entity), id);
  if (stored === null) return null;
  return parseClocks(stored.fieldHlc)[field] ?? null;
};
