import { PENDING_OP_TABLES, getSyncState, latestPendingSeq } from '@gameplan/storage';
import { addNetworkStateListener, getNetworkStateAsync } from 'expo-network';
import type { NetworkState } from 'expo-network';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { catalogApi } from '@/data/catalog-api';
import { useDatabase } from '@/data/database';
import { syncEnv } from '@/data/env';
import { session } from '@/features/account/auth-client';
import { useToast } from '@/ui/components/toast';
import { createReconnectNotices } from './reconnect-notices';
import { runSync } from './run-sync';
import { createSyncScheduler } from './scheduler';
import { syncApi } from './sync-client';
import { onSyncRequest } from './sync-requests';

/**
 * Connected, not "internet reachable": reachability flaps while switching
 * networks, and each flap would toast "Offline" and reset the backoff. A
 * captive portal reads as online, and its failed sync backs off as usual.
 */
const isOnline = (state: NetworkState): boolean => state.isConnected === true;

/**
 * Only 'background' stops sync. 'inactive' is Control Center, a Face ID
 * prompt or a call banner, and 'unknown' a cold start on its way to active.
 */
const isForeground = (state: AppStateStatus): boolean => state !== 'background';

/**
 * Runs sync on its own (SPEC-sync-transport.md): at launch and on coming to
 * the foreground, when the network returns, 2 s after local edits, every 5
 * minutes while open, and when asked (after signing in); in the background,
 * nothing. One per database, so an erase starts a fresh one. Renders nothing.
 *
 * "Signed in" means this database belongs to the session's account, not just
 * that tokens exist: signing out erases the database before it ends the
 * session (sign-out.ts), and syncing the fresh one in between would bring the
 * library back onto the phone being signed out of (review of #21).
 */
export const SyncTriggers = () => {
  const adapter = useDatabase();
  // Stable (memoised in ToastProvider): a new one would restart the scheduler.
  const { show } = useToast();

  useEffect(() => {
    const notices = createReconnectNotices(show);
    const signedIn = async () => {
      const current = await session.current();
      if (current === null) return false;
      return (await getSyncState(adapter)).ownerUserId === current.user.id;
    };
    const scheduler = createSyncScheduler({
      sync: async () => {
        await runSync({ adapter, env: syncEnv, api: syncApi, catalog: catalogApi });
      },
      signedIn,
      onSuccess: notices.synced,
      onSkip: notices.skipped,
      // The kind only ('offline', 'failed', …): a failure never carries op data.
      onFailure: (kind, retrying) => {
        console.warn(`Sync failed: ${kind}`);
        notices.failed(retrying);
      },
    });
    let mounted = true;

    // A new outbox position is a local edit; a push emptying the outbox isn't.
    // Watched only once the starting position is known, so the launch sync's
    // own push can't read as an edit. Reads after the database closes (an
    // erase) fail, and are dropped.
    let seen = 0;
    const outboxChanged = () => {
      latestPendingSeq(adapter)
        .then((latest) => {
          if (!mounted || latest <= seen) return;
          seen = latest;
          scheduler.edited();
        })
        .catch(() => undefined);
    };
    let unsubscribe = (): void => undefined;
    latestPendingSeq(adapter)
      .then((latest) => {
        seen = latest;
      })
      // Unread, edits are still watched: at worst one extra sync.
      .catch(() => undefined)
      .finally(() => {
        if (mounted) unsubscribe = adapter.subscribe(PENDING_OP_TABLES, outboxChanged);
      });

    // Seeded, so a launch offline still sees the network come back.
    let online: boolean | null = null;
    getNetworkStateAsync()
      .then((state) => {
        online ??= isOnline(state);
      })
      .catch(() => undefined);
    // Toasts for a signed-in player only (owner, 2026-11-11).
    const network = addNetworkStateListener((state) => {
      const now = isOnline(state);
      if (online === true && !now) {
        void signedIn()
          .then((yes) => yes && notices.wentOffline())
          .catch(() => undefined);
      }
      if (online === false && now) {
        // Announced only when this reconnect's sync will run and report back.
        void signedIn()
          .then((yes) => yes && notices.cameBack())
          .catch(() => undefined)
          .finally(() => void scheduler.networkBack());
      }
      online = now;
    });

    let foreground = isForeground(AppState.currentState);
    const app = AppState.addEventListener('change', (next) => {
      const now = isForeground(next);
      if (now && !foreground) void scheduler.start();
      if (!now && foreground) scheduler.stop();
      foreground = now;
    });

    const requests = onSyncRequest(() => void scheduler.syncNow());

    if (foreground) void scheduler.start();

    return () => {
      mounted = false;
      scheduler.stop();
      unsubscribe();
      network.remove();
      app.remove();
      requests();
    };
  }, [adapter, show]);

  return null;
};
