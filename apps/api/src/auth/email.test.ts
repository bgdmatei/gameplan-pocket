import { describe, expect, it } from 'vitest';
import { createResendTransport } from './email';

describe('createResendTransport', () => {
  // A thrown error reaches the log; the address and the key must not
  // (SPEC-auth-identity.md §Never), even when Resend echoes them back.
  it('reports a failure by status alone', async () => {
    const transport = createResendTransport({
      apiKey: 're_secret_key',
      from: 'Gameplan <onboarding@resend.dev>',
      fetch: async () =>
        new Response(JSON.stringify({ message: 'Invalid `to`: player@example.com' }), {
          status: 422,
        }),
    });

    const sent = transport.sendCode('player@example.com', '123456');
    await expect(sent).rejects.toThrow('Resend answered 422');
    await expect(sent).rejects.not.toThrow(/player@example\.com|re_secret_key|123456/);
  });
});
