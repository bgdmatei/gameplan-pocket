const RESEND_URL = 'https://api.resend.com/emails';

/** Sends a sign-in code. Throws on failure, naming neither the address nor the code. */
export type EmailTransport = { sendCode: (to: string, code: string) => Promise<void> };

export type ResendOptions = {
  apiKey: string;
  from: string;
  fetch?: typeof globalThis.fetch;
};

/**
 * Resend over its HTTP API, so no SDK. A failure reports only the status:
 * Resend's error body may echo the address it was sent.
 */
export const createResendTransport = ({
  apiKey,
  from,
  fetch = globalThis.fetch,
}: ResendOptions): EmailTransport => ({
  sendCode: async (to, code) => {
    const response = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `Your Gameplan code: ${code}`,
        text: `Your sign-in code is ${code}. It works for 10 minutes.\n\nIf you didn't ask for it, ignore this email.`,
      }),
    });
    if (!response.ok) throw new Error(`Resend answered ${response.status}`);
  },
});

/**
 * Prints the code, never the address, for local dev and tests; `readEnv`
 * refuses it in production. Tests pass `print` to read the code back.
 */
export const createConsoleTransport = (
  print: (line: string) => void = (line) => console.warn(line),
): EmailTransport => ({
  sendCode: async (_to, code) => {
    print(`Sign-in code: ${code}`);
  },
});
