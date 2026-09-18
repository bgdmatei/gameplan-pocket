import { describe, expect, it } from 'vitest';
import { ENTRY_STATUSES, canTransition, entryStatusSchema } from './status';
import type { EntryStatus } from './status';

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

/**
 * Transposed copy of the table in SPEC-domain-model.md §Status state machine.
 * Deliberately a different representation from TRANSITIONS in status.ts, so a
 * typo in the implementation fails here instead of being mirrored.
 *
 * Rows are `from`, columns are `to`, `x` = allowed, `.` = rejected,
 * `=` = same status (a no-op, always allowed).
 */
const SPEC_TABLE = `
            wishlist backlog playing paused completed dropped
  wishlist     =        x       x      .        .        x
  backlog      x        =       x      .        x        x
  playing      .        x       =      x        x        x
  paused       .        x       x      =        x        x
  completed    .        .       x      .        =        .
  dropped      .        x       x      .        .        =
`;

const parseSpecTable = (): { from: EntryStatus; to: EntryStatus; allowed: boolean }[] => {
  const rows = SPEC_TABLE.trim().split('\n');
  const header = rows[0]?.trim().split(/\s+/) as EntryStatus[];
  expect(header).toEqual([...ENTRY_STATUSES]);

  return rows.slice(1).flatMap((row) => {
    const [from, ...cells] = row.trim().split(/\s+/);
    expect(ENTRY_STATUSES).toContain(from);
    expect(cells).toHaveLength(ENTRY_STATUSES.length);

    return cells.map((cell, index) => ({
      from: from as EntryStatus,
      to: header[index] as EntryStatus,
      allowed: cell === 'x' || cell === '=',
    }));
  });
};

describe('canTransition', () => {
  const cells = parseSpecTable();

  it('covers all 36 combinations', () => {
    expect(cells).toHaveLength(ENTRY_STATUSES.length ** 2);
  });

  it.each(cells)('$from -> $to is $allowed', ({ from, to, allowed }) => {
    expect(canTransition(from, to)).toBe(allowed);
  });

  it('treats every same-status write as an allowed no-op', () => {
    for (const status of ENTRY_STATUSES) {
      expect(canTransition(status, status)).toBe(true);
    }
  });

  it('leaves no status unreachable: every status has an incoming and outgoing edge', () => {
    for (const status of ENTRY_STATUSES) {
      const outgoing = ENTRY_STATUSES.filter((to) => to !== status && canTransition(status, to));
      const incoming = ENTRY_STATUSES.filter(
        (from) => from !== status && canTransition(from, status),
      );
      expect(outgoing.length, `${status} has no outgoing edge`).toBeGreaterThan(0);
      expect(incoming.length, `${status} has no incoming edge`).toBeGreaterThan(0);
    }
  });
});
