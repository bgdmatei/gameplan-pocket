import { describe, expect, it } from 'vitest';
import { ENTRY_STATUSES, entryStatusSchema } from './status';

describe('entryStatusSchema', () => {
  it('accepts every declared status', () => {
    for (const status of ENTRY_STATUSES) {
      expect(entryStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it('lists the six statuses from the spec', () => {
    expect([...ENTRY_STATUSES]).toEqual([
      'wishlist',
      'backlog',
      'playing',
      'paused',
      'completed',
      'dropped',
    ]);
  });

  it('rejects anything else', () => {
    expect(entryStatusSchema.safeParse('finished').success).toBe(false);
    expect(entryStatusSchema.safeParse('').success).toBe(false);
  });
});
