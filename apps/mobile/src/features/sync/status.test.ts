import { describe, expect, it } from 'vitest';
import { INITIAL_ACTIVITY, phaseOf, reduceSyncActivity } from './status';
import type { SyncEvent, SyncPhase } from './status';

const AT = '2026-11-11T15:00:00.000Z';
const failed = (kind: string): SyncEvent => ({ type: 'failed', kind, at: AT });
const started: SyncEvent = { type: 'started' };
const succeeded: SyncEvent = { type: 'succeeded' };
const offline: SyncEvent = { type: 'went_offline' };
const online: SyncEvent = { type: 'came_online' };

const after = (events: readonly SyncEvent[]) => events.reduce(reduceSyncActivity, INITIAL_ACTIVITY);

describe('sync activity', () => {
  it.each<{ case: string; events: SyncEvent[]; phase: SyncPhase }>([
    { case: 'a sync running', events: [started], phase: 'syncing' },
    { case: 'a sync that finished', events: [started, succeeded], phase: 'synced' },
    { case: 'any other failure', events: [started, failed('failed')], phase: 'error' },
    {
      case: 'a retry that succeeds',
      events: [failed('failed'), started, succeeded],
      phase: 'synced',
    },
    // Connected but the server unreachable (5xx, timeout): an error, retrying.
    { case: 'a server that cannot be reached', events: [failed('offline')], phase: 'error' },
    // No connection is its own phase, whatever the run said.
    {
      case: 'a run failing as the network drops',
      events: [started, offline, failed('offline')],
      phase: 'offline',
    },
    { case: 'the network dropping mid-sync', events: [started, offline], phase: 'offline' },
    {
      case: 'the network back, its sync running',
      events: [offline, online, started],
      phase: 'syncing',
    },
    // Review of #22: a run finishing while offline must not read as synced.
    {
      case: 'a run finishing after the network dropped',
      events: [started, offline, succeeded],
      phase: 'offline',
    },
    // Review of #22: a network flap must not hide an error still true.
    {
      case: 'an error, then a network flap',
      events: [failed('failed'), offline, online],
      phase: 'error',
    },
    // Review of #22: a session ending is not an error that lingers.
    { case: 'a session that ended', events: [started, failed('ended')], phase: 'synced' },
  ])('$case → $phase', ({ events, phase }) => {
    expect(phaseOf(after(events))).toBe(phase);
  });

  it('keeps the last error, kind and time only, after a later success', () => {
    expect(after([failed('failed'), started, succeeded]).lastError).toEqual({
      kind: 'failed',
      at: AT,
    });
  });
});
