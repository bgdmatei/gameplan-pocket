import { describe, expect, it } from 'vitest';
import { hoursMinutesToMinutes, minutesToHoursMinutes, playtimeMinutesSchema } from './playtime';

describe('playtimeMinutesSchema', () => {
  it.each([0, 1, 1_000_000])('accepts %i', (value) => {
    expect(playtimeMinutesSchema.safeParse(value).success).toBe(true);
  });

  it.each([-1, 1_000_001, 1.5])('rejects %s', (value) => {
    expect(playtimeMinutesSchema.safeParse(value).success).toBe(false);
  });
});

describe('minutesToHoursMinutes', () => {
  it.each([
    [0, { hours: 0, minutes: 0 }],
    [59, { hours: 0, minutes: 59 }],
    [60, { hours: 1, minutes: 0 }],
    [135, { hours: 2, minutes: 15 }],
  ])('splits %i minutes', (total, expected) => {
    expect(minutesToHoursMinutes(total)).toEqual(expected);
  });
});

describe('hoursMinutesToMinutes', () => {
  it('combines hours and minutes', () => {
    expect(hoursMinutesToMinutes({ hours: 2, minutes: 15 })).toEqual({ ok: true, value: 135 });
  });

  it.each([
    [{ hours: 1, minutes: 60 }, 'minutes'],
    [{ hours: -1, minutes: 0 }, 'hours'],
    [{ hours: 0, minutes: -5 }, 'minutes'],
    [{ hours: 1.5, minutes: 0 }, 'hours'],
  ])('rejects %o', (input, field) => {
    const result = hoursMinutesToMinutes(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatchObject({ code: 'invalid_field', field });
  });

  it('round-trips', () => {
    for (const total of [0, 7, 60, 599, 1_000]) {
      expect(hoursMinutesToMinutes(minutesToHoursMinutes(total))).toEqual({
        ok: true,
        value: total,
      });
    }
  });
});
