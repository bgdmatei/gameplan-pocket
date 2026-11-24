import { describe, expect, it } from 'vitest';
import { formatHlc } from '../clock/hlc';
import type { Op } from '../op/schema';
import { BASE_TEXT_CLOCK, EMPTY_ROW, isDeleted, mergeOp, mergeRow } from './merge';
import type { RowState } from './merge';

const NOTE = '01890a5d-ac96-774b-bcce-b302099a8057';
const PHONE = '00000000000000aa';
const TABLET = '00000000000000bb';

const at = (wallMs: number, nodeId = PHONE): string => formatHlc({ wallMs, counter: 0, nodeId });

const set = (hlc: string, fields: Record<string, unknown>): Op => ({
  id: crypto.randomUUID(),
  entity: 'note_item',
  entityId: NOTE,
  type: 'set',
  fields,
  hlc,
  schemaVersion: 2,
});

const textEdit = (hlc: string, baseHlc: string): Op => ({
  id: crypto.randomUUID(),
  entity: 'note_item',
  entityId: NOTE,
  type: 'set',
  fields: { text: `Text at ${hlc}` },
  baseHlc,
  hlc,
  schemaVersion: 2,
});

const remove = (hlc: string): Op => ({
  id: crypto.randomUUID(),
  entity: 'note_item',
  entityId: NOTE,
  type: 'delete',
  hlc,
  schemaVersion: 2,
});

const created = set(at(1), { type: 'puzzle', text: 'Lever', resolved: false });

const replay = (ops: readonly Op[]): RowState => ops.reduce(mergeOp, EMPTY_ROW);

describe('merge', () => {
  it.each([
    {
      rule: 'a delete beats every edit made before it',
      ops: [created, set(at(2), { text: 'Lever behind the waterfall' }), remove(at(3))],
      deleted: true,
      text: 'Lever behind the waterfall',
    },
    {
      rule: 'an edit made after the delete brings the row back',
      ops: [created, remove(at(3)), set(at(4, TABLET), { text: 'Second lever' })],
      deleted: false,
      text: 'Second lever',
    },
    {
      rule: 'an older edit arriving after the delete does not bring it back',
      ops: [created, remove(at(3)), set(at(2, TABLET), { text: 'Second lever' })],
      deleted: true,
      text: 'Second lever',
    },
    {
      rule: 'a redelivered delete changes nothing',
      ops: [created, remove(at(3)), set(at(4), { text: 'Second lever' }), remove(at(3))],
      deleted: false,
      text: 'Second lever',
    },
  ])('$rule', ({ ops, deleted, text }) => {
    const row = replay(ops);

    expect(isDeleted(row.clocks)).toBe(deleted);
    expect(row.fields.text).toBe(text);
  });

  it.each([
    {
      rule: 'a winning text edit records its base',
      ops: [created, textEdit(at(3), at(1))],
      base: at(1),
    },
    {
      rule: 'a losing text edit leaves the base alone',
      ops: [created, textEdit(at(3), at(1)), textEdit(at(2, TABLET), at(1, TABLET))],
      base: at(1),
    },
    {
      rule: 'a winning text edit with no base drops the key',
      ops: [created, textEdit(at(3), at(1)), set(at(4), { text: 'Key' })],
      base: undefined,
    },
    {
      rule: 'an edit to another field leaves the base alone',
      ops: [created, textEdit(at(3), at(1)), set(at(4), { resolved: true })],
      base: at(1),
    },
  ])('$rule', ({ ops, base }) => {
    expect(replay(ops).clocks[BASE_TEXT_CLOCK]).toBe(base);
  });

  it.each([
    {
      rule: 'carries the base with a winning text',
      remote: [created, textEdit(at(3, TABLET), at(2))],
      base: at(2),
    },
    {
      rule: 'keeps its own base when the remote text is older',
      remote: [created, textEdit(at(1, TABLET), at(0))],
      base: at(1),
    },
    {
      rule: 'drops the base when the winning text has none',
      remote: [created, set(at(3, TABLET), { text: 'Key' })],
      base: undefined,
    },
  ])('mergeRow $rule', ({ remote, base }) => {
    const local = replay([created, textEdit(at(2), at(1))]);

    const merged = mergeRow('note_item', local, replay(remote));

    expect(merged.clocks[BASE_TEXT_CLOCK]).toBe(base);
  });

  // A row written before bases were recorded, repaired by a snapshot or a
  // pull of the same edit alike.
  it('fills in a base only the incoming side holds, for the same text edit', () => {
    const edit = textEdit(at(2), at(1));
    const remote = replay([created, edit]);
    const withoutBase = {
      ...remote,
      clocks: Object.fromEntries(
        Object.entries(remote.clocks).filter(([key]) => key !== BASE_TEXT_CLOCK),
      ),
    };

    expect(mergeRow('note_item', withoutBase, remote).clocks[BASE_TEXT_CLOCK]).toBe(at(1));
    expect(mergeOp(withoutBase, edit).clocks[BASE_TEXT_CLOCK]).toBe(at(1));
  });

  it('keeps concurrent edits to different fields, in either order', () => {
    const text = set(at(2, PHONE), { text: 'Lever behind the waterfall' });
    const resolved = set(at(2, TABLET), { resolved: true });

    const phoneFirst = replay([created, text, resolved]);
    const tabletFirst = replay([created, resolved, text]);

    expect(phoneFirst).toEqual(tabletFirst);
    expect(phoneFirst.fields).toMatchObject({ text: 'Lever behind the waterfall', resolved: true });
  });
});
