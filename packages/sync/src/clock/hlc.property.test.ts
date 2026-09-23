import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatHlc, parseHlc, receive, tick } from './hlc';
import type { Hlc } from './hlc';

const NODE = '0000000000000001';
const OTHER_NODE = '00000000000000ff';

const nodeIdArb = fc.stringMatching(/^[0-9a-f]{16}$/);
const nowArb = fc.integer({ min: 0, max: 4_000_000_000_000 });
const hlcArb: fc.Arbitrary<Hlc> = fc.record({
  wallMs: nowArb,
  counter: fc.integer({ min: 0, max: 99_999 }),
  nodeId: nodeIdArb,
});

/** A local edit, or a clock heard from another device, at some device time. */
const eventArb = fc.oneof(
  fc.record({ kind: fc.constant('tick' as const), now: nowArb }),
  fc.record({ kind: fc.constant('receive' as const), now: nowArb, remote: hlcArb }),
);

const logicalOrder = (a: Hlc, b: Hlc): number =>
  Math.sign(a.wallMs - b.wallMs) ||
  Math.sign(a.counter - b.counter) ||
  (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0);

describe('hybrid logical clock', () => {
  it('only moves forward, past everything it has seen, whatever the device clock does', () => {
    fc.assert(
      fc.property(fc.array(eventArb, { minLength: 1, maxLength: 50 }), (events) => {
        let last: string | null = null;

        for (const event of events) {
          const remote = event.kind === 'receive' ? formatHlc(event.remote) : null;
          const current: string =
            remote === null ? tick(last, event.now, NODE) : receive(last, remote, event.now, NODE);

          // A repeated or earlier value would let a later edit lose to an
          // older one on every device.
          if (last !== null) expect(current > last).toBe(true);
          if (remote !== null) expect(current > remote).toBe(true);
          last = current;
        }
      }),
    );
  });

  it('sorts as text in the same order as the clocks it encodes', () => {
    fc.assert(
      fc.property(hlcArb, hlcArb, (a, b) => {
        const [textA, textB] = [formatHlc(a), formatHlc(b)];
        const textOrder = textA < textB ? -1 : textA > textB ? 1 : 0;

        expect(textOrder).toBe(logicalOrder(a, b));
        expect(parseHlc(textA)).toEqual(a);
      }),
    );
  });

  it('moves the wall on a millisecond rather than overflow the counter', () => {
    const full = formatHlc({ wallMs: 1_000, counter: 99_999, nodeId: OTHER_NODE });

    expect(parseHlc(tick(full, 1_000, NODE))).toEqual({ wallMs: 1_001, counter: 0, nodeId: NODE });
    expect(parseHlc(receive(null, full, 1_000, NODE))).toEqual({
      wallMs: 1_001,
      counter: 0,
      nodeId: NODE,
    });
  });
});
