import { describe, expect, it } from 'vitest';
import { compareIsoDate, isoDateSchema, isoDateTimeSchema } from './date';

describe('isoDateSchema', () => {
  it.each(['2026-09-18', '2024-02-29', '2026-01-01', '2026-12-31'])('accepts %s', (value) => {
    expect(isoDateSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ['2026-02-30', 'impossible day'],
    ['2026-13-01', 'impossible month'],
    ['2025-02-29', 'non-leap year'],
    ['2026-1-1', 'unpadded'],
    ['20260101', 'no separators'],
    ['2026-09-18T00:00:00Z', 'datetime'],
    ['', 'empty'],
  ])('rejects %s (%s)', (value) => {
    expect(isoDateSchema.safeParse(value).success).toBe(false);
  });
});

describe('isoDateTimeSchema', () => {
  it('accepts UTC instants', () => {
    expect(isoDateTimeSchema.safeParse('2026-09-18T10:00:00Z').success).toBe(true);
    expect(isoDateTimeSchema.safeParse('2026-09-18T10:00:00.123Z').success).toBe(true);
  });

  it('rejects a bare date and a space-separated stamp', () => {
    expect(isoDateTimeSchema.safeParse('2026-09-18').success).toBe(false);
    expect(isoDateTimeSchema.safeParse('2026-09-18 10:00:00').success).toBe(false);
  });
});

describe('compareIsoDate', () => {
  it('orders chronologically', () => {
    expect(compareIsoDate('2026-01-01', '2026-01-02')).toBeLessThan(0);
    expect(compareIsoDate('2026-02-01', '2026-01-31')).toBeGreaterThan(0);
    expect(compareIsoDate('2026-01-01', '2026-01-01')).toBe(0);
  });

  it('sorts a list', () => {
    const sorted = ['2026-10-01', '2026-02-05', '2025-12-31'].sort(compareIsoDate);
    expect(sorted).toEqual(['2025-12-31', '2026-02-05', '2026-10-01']);
  });
});
