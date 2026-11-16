import { formatHlc } from '@gameplan/sync';
import { describe, expect, it } from 'vitest';
import { createMemoryServer } from './memory-server';

// The convergence property (#19) trusts this server to keep the API's rules;
// these pin the two a wrong fake would quietly break.

const NOW = Date.UTC(2026, 10, 10);

const setOp = (n: number) => ({
  id: `01890a5d-ac96-774b-bcce-${String(n).padStart(12, '0')}`,
  entity: 'list',
  entityId: `list-${String(n).padStart(3, '0')}`,
  type: 'set',
  fields: { name: `List ${n}` },
  hlc: formatHlc({ wallMs: NOW, counter: n, nodeId: '3f9a2c1b7d4e8f60' }),
  schemaVersion: 1,
});

describe('memory server', () => {
  it('acknowledges a resent op but logs it once, keeping the log gap-free', () => {
    const server = createMemoryServer({ now: () => NOW });
    server.push('a', [setOp(1), setOp(2)]);
    const again = server.push('a', [setOp(2), setOp(3)]);

    expect(again.accepted).toEqual([setOp(2).id, setOp(3).id]);
    expect(server.pull('a', { after: 0 }).ops.map(({ seq }) => seq)).toEqual([1, 2, 3]);
  });

  it('pages a snapshot over every row, at the position it started from', () => {
    const server = createMemoryServer({ now: () => NOW });
    server.push('a', [1, 2, 3, 4, 5].map(setOp));
    server.push('b', [setOp(6)]);

    const ids: string[] = [];
    let page = server.snapshot('a', { limit: 2 });
    const { seq } = page;
    ids.push(...page.rows.map((row) => row.id));
    // A push mid-snapshot doesn't move the position the device pulls from.
    server.push('a', [setOp(7)]);
    while (page.nextCursor !== null) {
      page = server.snapshot('a', { cursor: page.nextCursor, limit: 2 });
      expect(page.seq).toBe(seq);
      ids.push(...page.rows.map((row) => row.id));
    }

    expect(seq).toBe(5);
    expect(ids).toEqual(['list-001', 'list-002', 'list-003', 'list-004', 'list-005', 'list-007']);
  });
});
