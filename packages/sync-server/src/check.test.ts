import { formatHlc } from '@gameplan/sync';
import { describe, expect, it } from 'vitest';
import { checkOp } from './check';

const NOW = Date.UTC(2026, 10, 10);
const clockAt = (wallMs: number) => formatHlc({ wallMs, counter: 0, nodeId: '3f9a2c1b7d4e8f60' });

const op = (overrides: Record<string, unknown> = {}) => ({
  id: '01890a5d-ac96-774b-bcce-b302099a8057',
  entity: 'library_entry',
  entityId: '9b385207-54aa-5778-81a4-815107b15eb0',
  type: 'set',
  fields: { status: 'playing' },
  hlc: clockAt(NOW),
  schemaVersion: 1,
  ...overrides,
});

describe('checkOp', () => {
  it('lets a well-formed op in', () => {
    expect(checkOp(op(), NOW)).toEqual({ ok: true, op: op() });
  });

  // The door's attacks (SPEC-sync-transport.md, criterion 7). Each was
  // proven by removing its check: the case then let the op in.
  it.each([
    {
      label: 'a server-managed column',
      raw: op({ fields: { userId: 'someone-else' } }),
      reason: 'invalid_op',
    },
    { label: 'an unknown entity', raw: op({ entity: 'users' }), reason: 'invalid_op' },
    { label: 'an over-long row id', raw: op({ entityId: 'x'.repeat(65) }), reason: 'invalid_op' },
    {
      label: 'an entity the server does not sync yet',
      raw: op({ entity: 'note_conflict', fields: { resolved: true } }),
      reason: 'unsupported_entity',
    },
    {
      label: 'a clock more than a minute ahead',
      raw: op({ hlc: clockAt(NOW + 61_000) }),
      reason: 'clock_ahead',
    },
  ])('refuses $label, naming the op', ({ raw, reason }) => {
    expect(checkOp(raw, NOW)).toEqual({ ok: false, reason, opId: op().id });
  });

  it('refuses something that is not an op without inventing an id for it', () => {
    expect(checkOp({ id: 42 }, NOW)).toEqual({ ok: false, reason: 'invalid_op', opId: undefined });
  });
});
