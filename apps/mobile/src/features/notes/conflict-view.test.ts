import type { NoteConflict } from '@gameplan/domain';
import { describe, expect, it } from 'vitest';
import { conflictView } from './conflict-view';

const conflict: NoteConflict = {
  id: 'conflict-1',
  noteItemId: 'note-1',
  text: 'Typed on the simulator',
  fromNodeId: '00000000000000aa',
  hlc: '000000000000001:00000:00000000000000aa',
  createdAt: '2026-11-25T10:00:00.000Z',
  resolved: false,
};

describe('conflictView', () => {
  // The device whose text lost saw its own words as "the other version".
  it.each([
    {
      device: 'that wrote the losing text',
      node: '00000000000000aa',
      winner: '00000000000000bb',
      current: 'Typed on the simulator',
      other: 'Typed on the phone',
      keepCurrent: 'keep_other',
      keepOther: 'keep_current',
    },
    {
      device: 'that wrote the winning text',
      node: '00000000000000bb',
      winner: '00000000000000bb',
      current: 'Typed on the phone',
      other: 'Typed on the simulator',
      keepCurrent: 'keep_current',
      keepOther: 'keep_other',
    },
    {
      // An editor left open across a keep both on one device: both sides its own.
      device: 'that wrote both texts',
      node: '00000000000000aa',
      winner: '00000000000000aa',
      current: 'Typed on the phone',
      other: 'Typed on the simulator',
      keepCurrent: 'keep_current',
      keepOther: 'keep_other',
    },
  ])('shows its own text as current on the device $device', (row) => {
    const note = { text: 'Typed on the phone', nodeId: row.winner };
    const view = conflictView(note, conflict, row.node);

    expect([view.current, view.other]).toEqual([row.current, row.other]);
    expect([view.choice('keep_current'), view.choice('keep_other')]).toEqual([
      row.keepCurrent,
      row.keepOther,
    ]);
    expect(view.choice('keep_both')).toBe('keep_both');
  });
});
