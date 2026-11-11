import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import type { Colors } from '@/ui/palette';
import type { SyncStatus } from './use-sync-status';

export type SyncStatusView = {
  /** The Account line (SPEC-sync-transport.md, owner 2026-11-10). */
  line: string;
  /** The Library icon's VoiceOver label: the line, and what a tap does. */
  label: string;
  /** One cloud family for all four states (owner, 2026-11-11). */
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  /** Turn the arrows while a sync runs (owner, 2026-11-11). */
  spinning: boolean;
  /** The icon's colour, by tone, as the toasts use them (owner, 2026-11-11). */
  tint: keyof Colors;
};

const MINUTE = 60_000;

/** "just now", "2 min ago", "3 h ago", "4 days ago"; a clock ahead reads as just now. */
export const syncedAgo = (iso: string, now: number): string => {
  const minutes = Math.floor((now - Date.parse(iso)) / MINUTE);
  // Unparseable, or a clock ahead: never "NaN days" or "in 3 min".
  if (Number.isNaN(minutes) || minutes < 1) return 'just now';
  if (minutes < 60) return `${String(minutes)} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)} h ago`;
  const days = Math.floor(hours / 24);
  return `${String(days)} ${days === 1 ? 'day' : 'days'} ago`;
};

/**
 * Offline and failing say so whatever is queued; otherwise queued changes
 * come before the time of the last sync, since they are what isn't safe yet.
 * A sync in progress keeps the line it had and shows only in the icon: most
 * take under a second, and a line flickering to "Syncing" would be noise.
 */
export const describeSyncStatus = (
  { phase, lastSyncedAt, pending }: Pick<SyncStatus, 'phase' | 'lastSyncedAt' | 'pending'>,
  now: number,
): SyncStatusView => {
  const line =
    phase === 'offline'
      ? 'Offline'
      : phase === 'error'
        ? 'Sync failed, retrying'
        : pending > 0
          ? `Waiting to sync (${String(pending)} ${pending === 1 ? 'change' : 'changes'})`
          : lastSyncedAt === null
            ? 'Waiting to sync'
            : `Synced ${syncedAgo(lastSyncedAt, now)}`;

  const look: Pick<SyncStatusView, 'icon' | 'tint'> =
    phase === 'offline'
      ? { icon: 'cloud-off-outline', tint: 'warning' }
      : phase === 'error'
        ? { icon: 'cloud-outline', tint: 'danger' }
        : phase === 'syncing' || pending > 0 || lastSyncedAt === null
          ? // Running, or changes not yet safe: never the green "done".
            { icon: 'cloud-sync-outline', tint: 'accent' }
          : { icon: 'cloud-check-outline', tint: 'success' };

  const spoken = phase === 'syncing' ? 'Syncing' : line;
  return {
    line,
    label: `${spoken}. Double-tap to sync now.`,
    spinning: phase === 'syncing',
    ...look,
  };
};
