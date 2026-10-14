import { describe, expect, it } from 'vitest';
import { createTestApp } from './testing/auth';

const ALLOWED = 'https://app.example.com';
const EVIL = 'https://evil.example.com';

describe('CORS', () => {
  // Attack 15: only allowlisted origins get Access-Control-Allow-Origin, on a
  // request and on its preflight; an empty list, as today, allows none.
  it.each([
    { list: [ALLOWED], origin: ALLOWED, allowed: true },
    { list: [ALLOWED], origin: EVIL, allowed: false },
    { list: [], origin: ALLOWED, allowed: false },
  ])('$origin with allowlist $list → allowed: $allowed', async ({ list, origin, allowed }) => {
    const { app } = await createTestApp({ corsOrigins: list });

    const request = await app.request('/health', { headers: { Origin: origin } });
    const preflight = await app.request('/auth/code', {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });

    const expected = allowed ? origin : null;
    expect(request.headers.get('Access-Control-Allow-Origin')).toBe(expected);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(expected);
  });
});
