import type { SnapshotRow } from '@gameplan/contracts';
import { describe, expect, it } from 'vitest';
import { formatHlc } from '../clock/hlc';
import type { Op } from '../op/schema';
import { opForProtocol2, rowForProtocol2 } from './protocol-2';

const hlc = formatHlc({ wallMs: 1, counter: 0, nodeId: '3f9a2c1b7d4e8f60' });

const conflictOp: Op = {
  id: '01890a5d-ac96-774b-bcce-b302099a8057',
  entity: 'note_conflict',
  entityId: 'c-1',
  type: 'set',
  fields: { resolved: true },
  hlc,
  schemaVersion: 2,
};

const noteRow: SnapshotRow = {
  entity: 'note_item',
  id: 'n-1',
  fields: { text: 'Lever' },
  fieldHlc: { text: hlc, $base: hlc, '$base:text': hlc, $delete: hlc },
  deleted: false,
};

// A protocol-2 build throws on a note_conflict op or row (it can't store
// one), and its merge knows `$delete` only. Proven by passing each through.
describe('serving a protocol-2 app', () => {
  it('withholds note conflicts', () => {
    expect(opForProtocol2(conflictOp)).toBeNull();
    expect(rowForProtocol2({ ...noteRow, entity: 'note_conflict' })).toBeNull();
  });

  it('keeps every other op and row, minus the reserved keys it does not know', () => {
    const edit: Op = { ...conflictOp, entity: 'note_item', fields: { text: 'Key' }, baseHlc: hlc };

    expect(opForProtocol2(edit)).toBe(edit);
    expect(rowForProtocol2(noteRow)).toEqual({
      ...noteRow,
      fieldHlc: { text: hlc, $delete: hlc },
    });
  });
});
