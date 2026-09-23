import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Op } from '../op/schema';
import { createReplicas, deliver, edit, nowArb, snapshot, stepArb } from '../testing/replicas';

/**
 * A failing run prints its seed and path; replay it exactly with
 * `FC_SEED=<seed> FC_PATH=<path> pnpm --filter @gameplan/sync test`.
 */
const replay = {
  numRuns: Number(process.env.FC_NUM_RUNS ?? 1_000),
  ...(process.env.FC_SEED === undefined ? {} : { seed: Number(process.env.FC_SEED) }),
  ...(process.env.FC_PATH === undefined ? {} : { path: process.env.FC_PATH }),
};

describe('convergence', () => {
  it('three devices end up identical, whatever order, duplication or delay their edits arrive in', () => {
    fc.assert(
      fc.property(
        fc.array(stepArb, { minLength: 1, maxLength: 60 }),
        // The order every op is finally delivered in, to every device.
        fc.array(fc.nat(), { maxLength: 60 }),
        nowArb,
        (steps, finalOrder, finalNow) => {
          const replicas = createReplicas();
          const made: Op[] = [];

          for (const step of steps) {
            const replica = replicas[step.replica];
            if (replica === undefined) throw new Error('No such replica.');

            if (step.kind === 'edit') {
              made.push(edit(replica, step.change, step.now, `op-${made.length}`));
            } else if (made.length > 0) {
              const op = made[step.op % made.length];
              if (op !== undefined) deliver(replica, op, step.now);
            }
          }

          // Eventually everything reaches everyone, each device in its own
          // shuffled order; ops a device already has arrive again.
          replicas.forEach((replica, index) => {
            const order = made
              .map((op, position) => ({
                op,
                key: finalOrder[(position + index) % finalOrder.length] ?? position,
              }))
              .sort((a, b) => a.key - b.key);
            for (const { op } of order) deliver(replica, op, finalNow);
          });

          const [first, ...rest] = replicas.map(snapshot);
          for (const other of rest) expect(other).toEqual(first);
        },
      ),
      replay,
    );
  });
});
