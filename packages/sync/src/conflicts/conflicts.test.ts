import { describe, expect, it } from 'vitest';
import { formatHlc } from '../clock/hlc';
import { conflictFromLosingEdit, isConcurrentTextEdit } from './conflicts';

const NOTE = '01890a5d-ac96-774b-bcce-b302099a8057';
const PHONE = '00000000000000aa';
const TABLET = '00000000000000bb';

const at = (wallMs: number, nodeId = PHONE): string => formatHlc({ wallMs, counter: 0, nodeId });

describe('isConcurrentTextEdit', () => {
  // The note's first text is at(1). Each case is one device holding a text
  // and receiving another; `held.baseHlc` is the row's `$base:text`.
  it.each([
    {
      case: 'an edit on top of the held text',
      incoming: { hlc: at(2, TABLET), baseHlc: at(1) },
      held: { hlc: at(1) },
      concurrent: false,
    },
    {
      case: 'an older edit the held text was built on',
      incoming: { hlc: at(2), baseHlc: at(1) },
      held: { hlc: at(3, TABLET), baseHlc: at(2) },
      concurrent: false,
    },
    {
      case: 'its own edit, pulled back',
      incoming: { hlc: at(2), baseHlc: at(1) },
      held: { hlc: at(2), baseHlc: at(1) },
      concurrent: false,
    },
    // Review finding: an editor open across a "keep both" on the same
    // device saves over the joined text; trusting the node lost it.
    {
      case: 'a race between two edits from one device',
      incoming: { hlc: at(3), baseHlc: at(1) },
      held: { hlc: at(2), baseHlc: at(1) },
      concurrent: true,
    },
    {
      case: 'an edit with no base',
      incoming: { hlc: at(2, TABLET) },
      held: { hlc: at(3), baseHlc: at(1) },
      concurrent: false,
    },
    {
      case: 'a race, the later edit arriving',
      incoming: { hlc: at(3, TABLET), baseHlc: at(1) },
      held: { hlc: at(2), baseHlc: at(1) },
      concurrent: true,
    },
    {
      case: 'a race, the earlier edit arriving',
      incoming: { hlc: at(2), baseHlc: at(1) },
      held: { hlc: at(3, TABLET), baseHlc: at(1) },
      concurrent: true,
    },
    // Review finding: clock order passed this race, as the held text's base
    // is newer than the incoming edit, and a snapshot only carries T4.
    {
      case: 'a race with the end of a chain the incoming edit never saw',
      incoming: { hlc: at(2), baseHlc: at(1) },
      held: { hlc: at(4, TABLET), baseHlc: at(3, TABLET) },
      concurrent: true,
    },
    {
      case: 'a race with a held text that has no base',
      incoming: { hlc: at(3, TABLET), baseHlc: at(1) },
      held: { hlc: at(2) },
      concurrent: true,
    },
  ])('$case: $concurrent', ({ incoming, held, concurrent }) => {
    expect(isConcurrentTextEdit(incoming, held)).toBe(concurrent);
  });
});

describe('conflictFromLosingEdit', () => {
  // Pinned id: every device that spots the race writes this row, so a
  // different id between app versions would split one conflict into two.
  it('keeps the losing text, its clock, device and time, under a pinned id', () => {
    const hlc = at(Date.UTC(2026, 10, 24, 10), TABLET);
    const losing = { text: 'Lever behind the waterfall', hlc };

    expect(conflictFromLosingEdit(NOTE, losing)).toEqual({
      id: '2a175164-61b2-5b58-ad04-7afcb7649b42',
      noteItemId: NOTE,
      text: 'Lever behind the waterfall',
      fromNodeId: TABLET,
      hlc,
      createdAt: '2026-11-24T10:00:00.000Z',
      resolved: false,
    });
  });
});
