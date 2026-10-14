import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, post } from '../testing/auth';
import type { TestAuth } from '../testing/auth';
import type { Hono } from 'hono';

const MINUTE = 60 * 1000;

describe('POST /auth/code', () => {
  let t: TestAuth & { app: Hono };

  beforeAll(async () => {
    t = await createTestApp();
    await t.repository.findOrCreateUser('known@example.com');
  });

  const sentTo = (address: string) => t.sent.filter((sent) => sent.to === address);

  // Attack 9: the answer never says whether the email has an account.
  it('answers a known and an unknown email exactly alike, and sends both a code', async () => {
    const known = await post(t.app, '/auth/code', { email: 'known@example.com' });
    const unknown = await post(t.app, '/auth/code', { email: 'nobody@example.com' });

    expect([known.status, await known.text()]).toEqual([202, '']);
    expect([unknown.status, await unknown.text()]).toEqual([202, '']);
    // The send happens after the answer: wait for it rather than assert at once.
    await vi.waitFor(() => {
      expect(sentTo('known@example.com')).toHaveLength(1);
      expect(sentTo('nobody@example.com')).toHaveLength(1);
    });
    expect(sentTo('known@example.com')[0]?.code).toMatch(/^\d{6}$/);
  });

  // 1 per minute and 5 per hour; over either, still 202 and nothing sent.
  it('sends at most one code a minute and five an hour, answering 202 throughout', async () => {
    const address = 'limits@example.com';
    const statuses: number[] = [];
    // Twice at once, then once a minute: the duplicate and the sixth are refused.
    statuses.push((await post(t.app, '/auth/code', { email: address })).status);
    statuses.push((await post(t.app, '/auth/code', { email: address })).status);
    for (let minute = 1; minute <= 5; minute += 1) {
      t.clock.advance(MINUTE + 1000);
      statuses.push((await post(t.app, '/auth/code', { email: address })).status);
    }
    // A later send to another address proves the earlier ones have settled.
    await post(t.app, '/auth/code', { email: 'marker@example.com' });
    await vi.waitFor(() => expect(sentTo('marker@example.com')).toHaveLength(1));

    expect(statuses).toEqual([202, 202, 202, 202, 202, 202, 202]);
    expect(sentTo(address)).toHaveLength(5);
  });

  it('refuses a malformed email by naming the field, not echoing it', async () => {
    const response = await post(t.app, '/auth/code', { email: 'not-an-email' });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_request', fields: ['email'] });
  });
});
