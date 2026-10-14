import { getSyncState, updateSyncState } from '@gameplan/storage';
import type { Transaction } from '@gameplan/storage';
import { newNodeId } from '../ids';
import type { RandomBytes } from '../ids';

/**
 * This device's node id, created and saved on first use, in the caller's
 * transaction. The one place it is born: local edits, remote ops and sign-in
 * (which registers it with the server before anything was ever edited) all
 * go through here, so the device has one name in every clock and with the
 * server.
 */
export const ensureNodeId = async (tx: Transaction, randomBytes: RandomBytes): Promise<string> => {
  const { nodeId } = await getSyncState(tx);
  if (nodeId !== null) return nodeId;

  const created = newNodeId(randomBytes);
  await updateSyncState(tx, { nodeId: created });
  return created;
};
