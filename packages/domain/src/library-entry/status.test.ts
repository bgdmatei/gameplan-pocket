import { describe, expect, it } from 'vitest';
import { ENTRY_STATUSES, canTransition } from './status';
import type { EntryStatus } from './status';

/**
 * A transposed copy of the table in SPEC-domain-model.md, written differently
 * from TRANSITIONS so a typo in the implementation fails here rather than
 * being mirrored. Rows are `from`, columns are `to`.
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

describe('canTransition', () => {
  it('matches the approved table, cell for cell', () => {
    const rows = SPEC_TABLE.trim().split('\n');
    const header = rows[0]?.trim().split(/\s+/) as EntryStatus[];
    expect(header).toEqual([...ENTRY_STATUSES]);

    for (const row of rows.slice(1)) {
      const [from, ...cells] = row.trim().split(/\s+/);
      cells.forEach((cell, index) => {
        const to = header[index] as EntryStatus;
        expect(canTransition(from as EntryStatus, to), `${String(from)} -> ${to}`).toBe(
          cell === 'x' || cell === '=',
        );
      });
    }
  });

  it('leaves no status stranded: every one can be entered and left', () => {
    for (const status of ENTRY_STATUSES) {
      const out = ENTRY_STATUSES.filter((to) => to !== status && canTransition(status, to));
      const into = ENTRY_STATUSES.filter((from) => from !== status && canTransition(from, status));
      expect({ status, out: out.length > 0, into: into.length > 0 }).toEqual({
        status,
        out: true,
        into: true,
      });
    }
  });
});
