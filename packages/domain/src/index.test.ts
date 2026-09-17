import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import fc from 'fast-check';

describe('test tooling', () => {
  it('resolves zod and fast-check', () => {
    const schema = z.number().int();
    fc.assert(fc.property(fc.integer(), (n) => schema.safeParse(n).success));
    expect(schema.safeParse(1.5).success).toBe(false);
  });
});
