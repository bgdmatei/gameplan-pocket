import { describe, expect, it } from 'vitest';
import { progressSchema } from './progress';

describe('progressSchema', () => {
  it.each([
    { type: 'percentage', value: 0 },
    { type: 'percentage', value: 100 },
    { type: 'chapter', value: 'Chapter 4' },
    { type: 'achievements', earned: 0, total: 1 },
    { type: 'achievements', earned: 50, total: 50 },
    { type: 'freeform', value: 'halfway through the swamp' },
  ])('accepts %o', (value) => {
    expect(progressSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    { type: 'percentage', value: 101 },
    { type: 'percentage', value: 12.5 },
    { type: 'chapter', value: '' },
    { type: 'achievements', earned: 5, total: 4 },
    { type: 'achievements', earned: -1, total: 4 },
    { type: 'achievements', earned: 0, total: 0 },
    { type: 'freeform', value: '   ' },
    { type: 'unknown', value: 'x' },
  ])('rejects %o', (value) => {
    expect(progressSchema.safeParse(value).success).toBe(false);
  });

  it('trims text values', () => {
    expect(progressSchema.parse({ type: 'chapter', value: '  Act II  ' })).toEqual({
      type: 'chapter',
      value: 'Act II',
    });
  });

  it('rejects text longer than the limit', () => {
    expect(progressSchema.safeParse({ type: 'chapter', value: 'a'.repeat(101) }).success).toBe(
      false,
    );
    expect(progressSchema.safeParse({ type: 'freeform', value: 'a'.repeat(201) }).success).toBe(
      false,
    );
  });
});
