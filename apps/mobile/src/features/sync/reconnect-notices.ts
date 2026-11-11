import type { ToastTone } from '@/ui/components/toast';

/** Owner, 2026-11-11: minimal wording. */
export const NOTICES = {
  offline: 'Offline',
  synced: 'Sync completed',
  failed: 'Sync failed. Retrying',
} as const;

/**
 * The toasts around a lost connection, for a signed-in player: "Offline" when
 * it drops; once it returns, how the catch-up sync went. A failure is told
 * once per reconnect, and only while a retry is coming; the retry that
 * succeeds then says "Sync completed". Every other sync stays silent.
 */
export const createReconnectNotices = (show: (message: string, tone: ToastTone) => void) => {
  let awaitingSync = false;
  let toldFailure = false;

  return {
    wentOffline: (): void => {
      show(NOTICES.offline, 'warning');
    },
    cameBack: (): void => {
      awaitingSync = true;
      toldFailure = false;
    },
    /** The reconnect's sync never ran (signed out, backgrounded): nothing to tell. */
    skipped: (): void => {
      awaitingSync = false;
    },
    synced: (): void => {
      if (!awaitingSync) return;
      awaitingSync = false;
      show(NOTICES.synced, 'success');
    },
    failed: (retrying: boolean): void => {
      if (!awaitingSync) return;
      // No retry follows (the session ended): nothing left to announce.
      if (!retrying) {
        awaitingSync = false;
        return;
      }
      if (toldFailure) return;
      toldFailure = true;
      show(NOTICES.failed, 'problem');
    },
  };
};
