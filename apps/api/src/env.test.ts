import { describe, expect, it } from 'vitest';
import { readEnv } from './env';

describe('readEnv', () => {
  // An error message ends up in logs; a value here may be a secret.
  it('names what is missing, and never echoes a value', () => {
    const read = () =>
      readEnv({ DATABASE_URL: 'postgres://app:hunter2@db/app', TWITCH_CLIENT_ID: 'client-id' });

    expect(read).toThrow(/TWITCH_CLIENT_SECRET/);
    expect(read).not.toThrow(/hunter2|client-id/);
  });
});
