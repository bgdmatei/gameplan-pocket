import { SYNC_STATE_TABLES } from '@gameplan/storage';
import { useSyncExternalStore } from 'react';
import { useQuery } from '@/data/use-query';
import { ownsDatabase } from './owns-database';
import { syncActivity } from './status';

/**
 * Whether sync runs here, for the status UI (shown signed in only). Read
 * again when sync state changes (signing in sets the library's owner; signing
 * out opens a fresh database) and on every sync event, since a session that
 * ends, or one that starts after the owner was written, leaves sync_state as
 * it was (review of #23).
 */
export const useSyncsHere = (): boolean | null => {
  const activity = useSyncExternalStore(syncActivity.subscribe, syncActivity.get);
  const state = useQuery(ownsDatabase, SYNC_STATE_TABLES, [activity]);
  return state.status === 'ready' ? state.data : null;
};
