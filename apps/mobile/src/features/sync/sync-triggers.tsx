import { PENDING_OP_TABLES, latestPendingSeq } from '@gameplan/storage';
import { addNetworkStateListener, getNetworkStateAsync } from 'expo-network';
import type { NetworkState } from 'expo-network';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { catalogApi } from '@/data/catalog-api';
import { useDatabase } from '@/data/database';
import { syncEnv } from '@/data/env';
import { SyncRequestError } from '@/data/sync-api';
import { useToast } from '@/ui/components/toast';
import { ownsDatabase } from './owns-database';
import { createReconnectNotices } from './reconnect-notices';
import { runSync } from './run-sync';
import { createSyncScheduler } from './scheduler';
import { syncActivity } from './status';
import type { SyncEvent } from './status';
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
 * Only while this database belongs to the session's account (`ownsDatabase`).
 */
export const SyncTriggers = () => {
  const adapter = useDatabase();
  // Stable (memoised in ToastProvider): a new one would restart the scheduler.
  const { show } = useToast();

  useEffect(() => {
    const notices = createReconnectNotices(show);
    const signedIn = () => ownsDatabase(adapter);
    let mounted = true;
    // Status follows each real run, not each caller sharing one (single
    // flight), and stops once this database is gone: a run left over from
    // before an erase must not report into the fresh one's status.
    const report = (event: SyncEvent) => {
      if (mounted) syncActivity.dispatch(event);
    };
    const scheduler = createSyncScheduler({
      sync: async () => {
        report({ type: 'started' });
        try {
          await runSync({ adapter, env: syncEnv, api: syncApi, catalog: catalogApi });
          report({ type: 'succeeded' });
        } catch (error) {
          const kind = error instanceof SyncRequestError ? error.kind : 'error';
          report({ type: 'failed', kind, at: new Date().toISOString() });
          throw error;
        }
      },
      signedIn,
      onSuccess: notices.synced,
      onSkip: () => {
        report({ type: 'skipped' });
        notices.skipped();
      },
      // The kind only ('offline', 'failed', …): a failure never carries op data.
      onFailure: (kind, retrying) => {
        console.warn(`Sync failed: ${kind}`);
        notices.failed(retrying);
      },
    });
    // A new database (first open, or after an erase) has no history yet.
    syncActivity.reset();

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
        if (!online) report({ type: 'went_offline' });
      })
      .catch(() => undefined);
    // Toasts for a signed-in player only (owner, 2026-11-11).
    const network = addNetworkStateListener((state) => {
      const now = isOnline(state);
      report({ type: now ? 'came_online' : 'went_offline' });
      // Unknown before (the launch read not back yet) counts as online: the
      // first drop is still a drop worth telling (review of #23).
      if (online !== false && !now) {
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

    const requests = onSyncRequest(({ byPlayer }) => {
      // Marked first, so a tapped run shows even while an error holds.
      if (byPlayer) report({ type: 'requested' });
      void scheduler.syncNow();
    });

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
