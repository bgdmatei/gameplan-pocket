import { describe, expect, it } from 'vitest';
import { NOTICES, createReconnectNotices } from './reconnect-notices';

type Event = 'offline' | 'back' | 'skipped' | 'synced' | 'failed, retrying' | 'failed, no retry';

const toastsFor = (events: readonly Event[]): string[] => {
  const shown: string[] = [];
  const notices = createReconnectNotices((message, tone) => shown.push(`${message} (${tone})`));
  for (const event of events) {
    if (event === 'offline') notices.wentOffline();
    if (event === 'back') notices.cameBack();
    if (event === 'skipped') notices.skipped();
    if (event === 'synced') notices.synced();
    if (event === 'failed, retrying') notices.failed(true);
    if (event === 'failed, no retry') notices.failed(false);
  }
  return shown;
};

describe('reconnect notices', () => {
  it.each<{ case: string; events: Event[]; toasts: string[] }>([
    {
      case: 'a reconnect that syncs',
      events: ['offline', 'back', 'synced'],
      toasts: [`${NOTICES.offline} (warning)`, `${NOTICES.synced} (success)`],
    },
    {
      case: 'everyday syncs, which stay silent',
      events: ['synced', 'failed, retrying', 'synced'],
      toasts: [],
    },
    {
      case: 'a reconnect whose retries fail, then one succeeds',
      events: ['back', 'failed, retrying', 'failed, retrying', 'synced', 'synced'],
      toasts: [`${NOTICES.failed} (problem)`, `${NOTICES.synced} (success)`],
    },
    {
      case: 'a reconnect after which the session ended',
      events: ['back', 'failed, no retry', 'synced'],
      toasts: [],
    },
    // Review of #21: a reconnect while backgrounded must not announce a
    // later, unrelated sync.
    {
      case: 'a reconnect whose sync never ran',
      events: ['back', 'skipped', 'synced'],
      toasts: [],
    },
  ])('$case', ({ events, toasts }) => {
    expect(toastsFor(events)).toEqual(toasts);
  });
});
