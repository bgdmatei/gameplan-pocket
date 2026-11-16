import { describe, expect, it } from 'vitest';
import { describeSyncStatus } from './describe-status';
import type { SyncPhase } from './status';

const NOW = Date.parse('2026-11-11T15:00:00.000Z');
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

describe('sync status wording', () => {
  it.each<{ phase: SyncPhase; lastSyncedAt: string | null; pending: number; line: string }>([
    { phase: 'synced', lastSyncedAt: ago(0.5), pending: 0, line: 'Synced just now' },
    { phase: 'synced', lastSyncedAt: ago(2), pending: 0, line: 'Synced 2 min ago' },
    { phase: 'synced', lastSyncedAt: ago(150), pending: 0, line: 'Synced 2 h ago' },
    { phase: 'synced', lastSyncedAt: ago(60 * 24), pending: 0, line: 'Synced 1 day ago' },
    // Another device's clock ahead of this one: never "in 3 min".
    { phase: 'synced', lastSyncedAt: ago(-3), pending: 0, line: 'Synced just now' },
    { phase: 'synced', lastSyncedAt: 'not a time', pending: 0, line: 'Synced just now' },
    { phase: 'synced', lastSyncedAt: null, pending: 0, line: 'Waiting to sync' },
    { phase: 'synced', lastSyncedAt: ago(2), pending: 1, line: 'Waiting to sync (1 change)' },
    { phase: 'synced', lastSyncedAt: ago(2), pending: 3, line: 'Waiting to sync (3 changes)' },
    // A sync in progress keeps the line it had.
    { phase: 'syncing', lastSyncedAt: ago(2), pending: 3, line: 'Waiting to sync (3 changes)' },
    // Offline and failing say so, whatever is queued.
    { phase: 'offline', lastSyncedAt: ago(2), pending: 3, line: 'Offline' },
    { phase: 'error', lastSyncedAt: ago(2), pending: 3, line: 'Sync failed, retrying' },
  ])('$phase, $pending queued → $line', ({ phase, lastSyncedAt, pending, line }) => {
    expect(describeSyncStatus({ phase, lastSyncedAt, pending }, NOW).line).toBe(line);
  });

  // Review of #23: green "done" only when nothing waits and it has synced.
  it.each([
    { pending: 0, lastSyncedAt: ago(2), icon: 'cloud-check-outline' },
    { pending: 3, lastSyncedAt: ago(2), icon: 'cloud-sync-outline' },
    { pending: 0, lastSyncedAt: null, icon: 'cloud-sync-outline' },
  ])('shows $icon with $pending queued', ({ pending, lastSyncedAt, icon }) => {
    expect(describeSyncStatus({ phase: 'synced', lastSyncedAt, pending }, NOW).icon).toBe(icon);
  });

  it('tells VoiceOver the state and what a tap does', () => {
    const view = describeSyncStatus({ phase: 'syncing', lastSyncedAt: null, pending: 0 }, NOW);
    expect(view.label).toBe('Syncing. Double-tap to sync now.');
  });
});
