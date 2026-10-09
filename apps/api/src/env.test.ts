import { describe, expect, it } from 'vitest';
import { readEnv } from './env';

const valid = {
  DATABASE_URL: 'postgres://app:hunter2@db/app',
  TWITCH_CLIENT_ID: 'client-id',
  TWITCH_CLIENT_SECRET: 'client-secret',
  CATALOG_API_KEY: 'k'.repeat(16),
  JWT_SECRET: 'j'.repeat(32),
  CODE_SECRET: 'c'.repeat(32),
  EMAIL_TRANSPORT: 'console',
};

describe('readEnv', () => {
  // An error message ends up in logs; a value here may be a secret.
  it('names what is missing, and never echoes a value', () => {
    const read = () =>
      readEnv({ DATABASE_URL: 'postgres://app:hunter2@db/app', TWITCH_CLIENT_ID: 'client-id' });

    expect(read).toThrow(/TWITCH_CLIENT_SECRET/);
    expect(read).not.toThrow(/hunter2|client-id/);
  });

  // The console transport prints sign-in codes; in production that is a
  // log full of working codes (SPEC-auth-identity.md §Never).
  it('refuses the console email transport in production', () => {
    expect(() => readEnv(valid)).not.toThrow();
    expect(() => readEnv({ ...valid, NODE_ENV: 'production' })).toThrow(/EMAIL_TRANSPORT/);
  });

  // A real bug: .env.example leaves these lines blank, and a blank was read
  // as invalid, so a fresh local .env with the console transport would not start.
  it('treats a blank Resend line as unset, and requires it only for resend', () => {
    const blank = { ...valid, RESEND_API_KEY: '', EMAIL_FROM: '' };

    expect(() => readEnv(blank)).not.toThrow();
    expect(() => readEnv({ ...blank, EMAIL_TRANSPORT: 'resend' })).toThrow(
      /RESEND_API_KEY, EMAIL_FROM/,
    );
  });
});
