import {
  PENDING_OP_TABLES,
  SYNC_STATE_TABLES,
  countPendingOps,
  getSyncState,
} from '@gameplan/storage';
import { useSyncExternalStore } from 'react';
import { useQuery } from '@/data/use-query';
import { phaseOf, syncActivity } from './status';
import type { SyncPhase } from './status';

export type SyncStatus = {
  /** False until the stored half has been read: show nothing rather than a guess. */
  loaded: boolean;
  phase: SyncPhase;
  /** Null until this database first synced. */
  lastSyncedAt: string | null;
  /** Local changes waiting to be pushed. */
  pending: number;
  lastError: { kind: string; at: string } | null;
};

/**
 * The one source of sync state for screens (SPEC-sync-transport.md): what
 * sync is doing, from the scheduler, and when it last finished and what is
 * queued, from the database, re-read whenever either table changes.
 */
export const useSyncStatus = (): SyncStatus => {
  const activity = useSyncExternalStore(syncActivity.subscribe, syncActivity.get);
  const stored = useQuery(
    async (db) => ({
      lastSyncedAt: (await getSyncState(db)).lastSyncedAt,
      pending: await countPendingOps(db),
    }),
    [...SYNC_STATE_TABLES, ...PENDING_OP_TABLES],
    [],
  );
  const { lastSyncedAt, pending } =
    stored.status === 'ready' ? stored.data : { lastSyncedAt: null, pending: 0 };
  return {
    loaded: stored.status === 'ready',
    phase: phaseOf(activity),
    lastError: activity.lastError,
    lastSyncedAt,
    pending,
  };
};
