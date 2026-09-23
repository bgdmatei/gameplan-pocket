import { describe, expect, it } from 'vitest';
import { createTwitchToken } from './token';

const HOUR_S = 3_600;

/** A fake Twitch: counts calls, answers with numbered tokens valid for an hour. */
const fakeTwitch = (status = 200, body: unknown = null) => {
  let calls = 0;
  const fetch = async (): Promise<Response> => {
    calls += 1;
    return Response.json(body ?? { access_token: `token-${calls}`, expires_in: HOUR_S }, {
      status,
    });
  };
  return { fetch, calls: () => calls };
};

describe('Twitch token', () => {
  it('asks Twitch once for a burst of callers', async () => {
    const twitch = fakeTwitch();
    const token = createTwitchToken({ clientId: 'id', clientSecret: 's', now: () => 0, ...twitch });

    const tokens = await Promise.all([token.get(), token.get(), token.get()]);

    expect(tokens).toEqual(['token-1', 'token-1', 'token-1']);
    expect(twitch.calls()).toBe(1);
  });

  it('refreshes near expiry, and once after IGDB rejects the token', async () => {
    let nowMs = 0;
    const twitch = fakeTwitch();
    const token = createTwitchToken({
      clientId: 'id',
      clientSecret: 's',
      now: () => nowMs,
      ...twitch,
    });

    await token.get();
    nowMs = HOUR_S * 1000 * 0.5;
    expect(await token.get()).toBe('token-1');
    nowMs = HOUR_S * 1000 * 0.95;
    expect(await token.get()).toBe('token-2');

    token.invalidate();
    await Promise.all([token.get(), token.get()]);
    expect(twitch.calls()).toBe(3);
  });

  // Twitch's error body may echo what it was sent; the error must not.
  it('reports a failure by status alone', async () => {
    const twitch = fakeTwitch(403, { message: 'invalid client secret: s3cr3t' });
    const token = createTwitchToken({
      clientId: 'id',
      clientSecret: 's3cr3t',
      now: () => 0,
      ...twitch,
    });

    await expect(token.get()).rejects.toThrow('Twitch token request failed with status 403.');
  });
});
