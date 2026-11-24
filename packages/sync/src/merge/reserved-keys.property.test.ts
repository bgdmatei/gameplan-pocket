import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatHlc } from '../clock/hlc';
import { BASE_TEXT_CLOCK, DELETE_CLOCK, isDeleted, mergeRow } from './merge';
import type { RowState } from './merge';

const clockArb = fc
  .record({ wallMs: fc.integer({ min: 0, max: 9 }), counter: fc.nat(2) })
  .map(({ wallMs, counter }) => formatHlc({ wallMs, counter, nodeId: '00000000000000aa' }));

const fieldArb = fc.constantFrom('text', 'resolved', 'location');
const reservedArb = fc.constantFrom(DELETE_CLOCK, BASE_TEXT_CLOCK, '$future', '$text');

const clocksArb = fc.dictionary(fc.oneof(fieldArb, reservedArb), clockArb, { maxKeys: 6 });

const rowArb: fc.Arbitrary<RowState> = clocksArb.map((clocks) => ({
  fields: Object.fromEntries(
    Object.keys(clocks)
      .filter((key) => !key.startsWith('$'))
      .map((field) => [field, `${field} value`]),
  ),
  clocks,
}));

const fieldAndDeleteClocks = (clocks: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(clocks).filter(([key]) => key === DELETE_CLOCK || !key.startsWith('$')),
  );

describe('reserved clock keys', () => {
  it('never surface as fields, nor decide whether a row is deleted', () => {
    fc.assert(
      fc.property(rowArb, rowArb, (local, remote) => {
        const merged = mergeRow('note_item', local, remote);

        expect(Object.keys(merged.fields).filter((key) => key.startsWith('$'))).toEqual([]);
        for (const row of [local, remote, merged]) {
          expect(isDeleted(row.clocks)).toBe(isDeleted(fieldAndDeleteClocks(row.clocks)));
        }
      }),
    );
  });
});
