import { refreshResponseSchema } from '@gameplan/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestApp, device, post, requestCode, signIn } from '../testing/auth';
import { createResendTransport } from './email';

const PLAYER = 'private.player@example.com';
const BOUNCING = 'bouncing.player@example.com';

/** Resend failing, its error body echoing the address, as real ones do. */
const failingResend = createResendTransport({
  apiKey: 're_test_key',
  from: 'Gameplan <onboarding@resend.dev>',
  fetch: async (_url, init) =>
    Response.json({ message: `Cannot deliver to ${String(init?.body)}` }, { status: 500 }),
});

describe('logs during sign-in, refresh and sign-out', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Attack 11: notes, emails, codes and tokens never reach a log line
  // (CLAUDE.md §Privacy rules). The flow includes the paths that do log, so
  // the check is not passed by silence.
  it('contain no email, code or token, while the failures still get logged', async () => {
    const consoleLines: string[] = [];
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        consoleLines.push(args.map(String).join(' '));
      });
    }
    const t = await createTestApp({
      afterSend: async (to, code) => {
        if (to === BOUNCING) await failingResend.sendCode(to, code);
      },
    });

    // A send that fails, a request over the limit, and a wrong code.
    await requestCode(t, BOUNCING);
    await post(t.app, '/auth/code', { email: BOUNCING });
    const session = await signIn(t, PLAYER, '9999000000000001');
    t.clock.advance(61 * 1000);
    const code = await requestCode(t, PLAYER);
    await post(t.app, '/auth/verify', {
      email: PLAYER,
      code: '000000',
      device: device('9999000000000001'),
    });

    // Signed in: /me, a rotation, a stolen-token replay, then sign-out.
    await t.app.request('/me', { headers: { Authorization: `Bearer ${session.accessToken}` } });
    const rotated = refreshResponseSchema.parse(
      await (await post(t.app, '/auth/refresh', { refreshToken: session.refreshToken })).json(),
    );
    t.clock.advance(31 * 1000);
    await post(t.app, '/auth/refresh', { refreshToken: session.refreshToken });
    await post(t.app, '/auth/logout', { refreshToken: rotated.refreshToken });

    await vi.waitFor(() => expect(t.logs.some((line) => line.includes('email failed'))).toBe(true));
    const everything = [...t.logs, ...consoleLines].join('\n');
    const secrets = [
      PLAYER,
      BOUNCING,
      'private.player',
      'bouncing.player',
      code,
      ...t.sent.map((sent) => sent.code),
      session.accessToken,
      session.refreshToken,
      rotated.accessToken,
      rotated.refreshToken,
      're_test_key',
    ];
    for (const secret of secrets) expect(everything).not.toContain(secret);
  });
});
