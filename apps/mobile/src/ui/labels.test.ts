import { describe, expect, it } from 'vitest';
import { timeSince } from './labels';

describe('timeSince', () => {
  // Local times, so the cases hold in any time zone the suite runs in.
  const now = new Date(2026, 9, 27, 9, 0).getTime();
  const at = (month: number, day: number, hour = 12, year = 2026) =>
    new Date(year, month, day, hour).toISOString();

  it.each([
    [at(9, 27, 1), 'Today'],
    // An hour before midnight is yesterday, not "today" by elapsed time.
    [at(9, 26, 23), 'Yesterday'],
    [at(9, 21), '6 days ago'],
    [at(9, 20), '1 week ago'],
    [at(8, 28), '4 weeks ago'],
    [at(8, 27), '1 month ago'],
    [at(9, 28, 12, 2025), '11 months ago'],
    [at(9, 27, 12, 2025), '1 year ago'],
    [at(9, 27, 12, 2023), '3 years ago'],
    // A clock that ran ahead on another device: never "in 2 days".
    [at(9, 29), 'Today'],
  ])('%s reads %s', (iso, expected) => {
    expect(timeSince(iso, now)).toBe(expected);
  });
});
