import { z } from 'zod';
import { fail, ok } from '../shared/result';
import type { Result } from '../shared/result';

/** Upper bound is a sanity check, not a real limit: ~1,900 years of play. */
export const playtimeMinutesSchema = z.number().int().min(0).max(1_000_000);

export type HoursMinutes = { hours: number; minutes: number };

export const minutesToHoursMinutes = (total: number): HoursMinutes => ({
  hours: Math.floor(total / 60),
  minutes: total % 60,
});

export const hoursMinutesToMinutes = ({ hours, minutes }: HoursMinutes): Result<number> => {
  if (!Number.isInteger(hours) || hours < 0) {
    return fail({
      code: 'invalid_field',
      field: 'hours',
      message: 'Hours must be a whole number of 0 or more.',
    });
  }
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    return fail({
      code: 'invalid_field',
      field: 'minutes',
      message: 'Minutes must be a whole number between 0 and 59.',
    });
  }
  return ok(hours * 60 + minutes);
};
