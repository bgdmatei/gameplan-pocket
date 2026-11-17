import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatHlc } from '../clock/hlc';
import { downcastOp, opV1Schema, upcastOp } from './v1';
import { opSchema } from '../op/schema';

const envelope = fc.record({
  id: fc.uuid({ version: 7 }),
  entityId: fc.constantFrom('e-1', 'l-1'),
  hlc: fc
    .record({ wallMs: fc.integer({ min: 1, max: 2 ** 40 }), counter: fc.nat({ max: 99 }) })
    .map(({ wallMs, counter }) => formatHlc({ wallMs, counter, nodeId: '3f9a2c1b7d4e8f60' })),
});

const opArb = (version: 1 | 2, ratings: fc.Arbitrary<number | null>) =>
  fc.oneof(
    fc
      .record(
        { rating: ratings, favourite: fc.boolean(), status: fc.constantFrom('playing', 'dropped') },
        { requiredKeys: [] },
      )
      .filter((fields) => Object.keys(fields).length > 0)
      .chain((fields) =>
        envelope.map((e) => ({
          ...e,
          schemaVersion: version,
          entity: 'library_entry',
          type: 'set',
          fields,
        })),
      ),
    envelope.map((e) => ({
      ...e,
      schemaVersion: version,
      entity: 'list',
      type: 'set',
      fields: { name: 'Co-op' },
    })),
    envelope.map((e) => ({ ...e, schemaVersion: version, entity: 'list', type: 'delete' })),
  );

describe('casts between schema v1 and v2', () => {
  it('round-trip without loss for anything the app writes', () => {
    const v2 = opArb(
      2,
      fc.option(
        fc.nat({ max: 10 }).map((half) => half * 10),
        { nil: null },
      ),
    );
    const v1 = opArb(1, fc.option(fc.nat({ max: 10 }), { nil: null }));
    fc.assert(
      fc.property(v2, (raw) => {
        const op = opSchema.parse(raw);
        const down = downcastOp(op, 1);
        expect(down).not.toBeNull();
        if (down !== null) expect(upcastOp(down)).toEqual(op);
      }),
    );
    fc.assert(
      fc.property(v1, (raw) => {
        const op = opV1Schema.parse(raw);
        expect(downcastOp(upcastOp(op), 1)).toEqual(op);
      }),
    );
  });

  it('rounds a value the app never writes to the nearest step, halves up', () => {
    const at = (rating: number) =>
      opSchema.parse({
        id: '01890a5d-ac96-774b-bcce-b302099a8057',
        entityId: 'e-1',
        hlc: formatHlc({ wallMs: 1, counter: 0, nodeId: '3f9a2c1b7d4e8f60' }),
        schemaVersion: 2,
        entity: 'library_entry',
        type: 'set',
        fields: { rating },
      });
    const fieldsOf = (rating: number) => {
      const down = downcastOp(at(rating), 1);
      return down?.type === 'set' ? down.fields : null;
    };
    expect([73, 75, 100].map(fieldsOf)).toEqual([{ rating: 7 }, { rating: 8 }, { rating: 10 }]);
  });
});
