import { describe, expect, it } from 'vitest';
import { formatHlc } from '../clock/hlc';
import type { Op } from '../op/schema';
import { EMPTY_ROW, isDeleted, mergeOp } from './merge';
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
  schemaVersion: 1,
});

const remove = (hlc: string): Op => ({
  id: crypto.randomUUID(),
  entity: 'note_item',
  entityId: NOTE,
  type: 'delete',
  hlc,
  schemaVersion: 1,
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

  it('keeps concurrent edits to different fields, in either order', () => {
    const text = set(at(2, PHONE), { text: 'Lever behind the waterfall' });
    const resolved = set(at(2, TABLET), { resolved: true });

    const phoneFirst = replay([created, text, resolved]);
    const tabletFirst = replay([created, resolved, text]);

    expect(phoneFirst).toEqual(tabletFirst);
    expect(phoneFirst.fields).toMatchObject({ text: 'Lever behind the waterfall', resolved: true });
  });
});
