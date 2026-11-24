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
  schemaVersion: 2,
  ...overrides,
});

const conflict = (fields: Record<string, unknown> = {}) =>
  op({
    entity: 'note_conflict',
    entityId: '5b1c0d38-1f0b-5a8e-9d7c-2a4e6f8b0c1d',
    fields: {
      noteItemId: 'note-1',
      text: 'Lever behind the waterfall',
      fromNodeId: '3f9a2c1b7d4e8f60',
      hlc: clockAt(NOW - 1_000),
      createdAt: '2026-11-10T10:00:00.000Z',
      resolved: false,
      ...fields,
    },
  });

describe('checkOp', () => {
  it('lets a well-formed op in', () => {
    expect(checkOp(op(), NOW)).toEqual({ ok: true, op: op() });
    expect(checkOp(conflict(), NOW)).toEqual({ ok: true, op: conflict() });
  });

  it("lets an older app's op in at the current version", () => {
    expect(
      checkOp(op({ schemaVersion: 1, fields: { rating: 7, status: 'playing' } }), NOW),
    ).toEqual({
      ok: true,
      op: op({ fields: { rating: 70, status: 'playing' } }),
    });
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
      label: 'a NUL character, which Postgres cannot store',
      raw: op({ entity: 'list', fields: { name: 'a\u0000b' } }),
      reason: 'invalid_op',
    },
    {
      label: 'half an emoji, which Postgres cannot store',
      raw: op({ entity: 'list', fields: { name: 'a\uD83Db' } }),
      reason: 'invalid_op',
    },
    {
      label: 'a clock more than a minute ahead',
      raw: op({ hlc: clockAt(NOW + 61_000) }),
      reason: 'clock_ahead',
    },
    {
      label: 'a v1 op naming a server-managed column',
      raw: op({ schemaVersion: 1, fields: { userId: 'someone-else' } }),
      reason: 'invalid_op',
    },
    {
      label: 'a v1 rating out of v1 range, rather than converting it',
      raw: op({ schemaVersion: 1, fields: { rating: 11 } }),
      reason: 'invalid_op',
    },
    {
      label: 'a v2 rating marked as v1',
      raw: op({ schemaVersion: 1, fields: { rating: 70 } }),
      reason: 'invalid_op',
    },
    { label: 'an unknown schema version', raw: op({ schemaVersion: 3 }), reason: 'invalid_op' },
    // A conflict's text is note text: the same allowlist and limits apply.
    ...[
      { label: 'a conflict naming userId', fields: { userId: 'someone-else' } },
      { label: 'a conflict naming deleted', fields: { deleted: true } },
      { label: 'a conflict naming fieldHlc', fields: { fieldHlc: '{}' } },
      { label: 'a conflict naming a seq', fields: { seq: 1 } },
      { label: 'a conflict naming an unknown field', fields: { colour: 'gold' } },
      { label: 'conflict text over the note limit', fields: { text: 'x'.repeat(5_001) } },
      { label: 'conflict text with a NUL', fields: { text: 'a\u0000b' } },
    ].map(({ label, fields }) => ({ label, raw: conflict(fields), reason: 'invalid_op' })),
    {
      label: 'a note text built on a base no older than itself',
      raw: op({ entity: 'note_item', fields: { text: 'Lever' }, baseHlc: clockAt(NOW + 1) }),
      reason: 'invalid_op',
    },
    {
      label: 'a v1 op with a clock more than a minute ahead',
      raw: op({ schemaVersion: 1, hlc: clockAt(NOW + 61_000) }),
      reason: 'clock_ahead',
    },
  ])('refuses $label, naming the op', ({ raw, reason }) => {
    expect(checkOp(raw, NOW)).toEqual({ ok: false, reason, opId: op().id });
  });

  // Every synced entity has a table today, so the refusal for one that
  // doesn't is proven with a narrower set.
  it('refuses an entity in the op schema that has no server table yet', () => {
    expect(checkOp(conflict(), NOW, new Set(['list']))).toEqual({
      ok: false,
      reason: 'unsupported_entity',
      opId: op().id,
    });
  });

  // Review finding: the first NUL check searched the op's JSON, so a literal
  // backslash-u0000 typed in a note was refused too.
  it('lets in text that only looks like an escape, and whole emoji', () => {
    const fine = op({ entity: 'list', fields: { name: 'use \\u0000 to end 🎮' } });
    expect(checkOp(fine, NOW)).toEqual({ ok: true, op: fine });
  });

  it('refuses something that is not an op without inventing an id for it', () => {
    expect(checkOp({ id: 42 }, NOW)).toEqual({ ok: false, reason: 'invalid_op', opId: undefined });
  });
});
