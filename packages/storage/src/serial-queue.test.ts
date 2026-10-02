import { describe, expect, it } from 'vitest';
import { createSerialQueue } from './serial-queue';

describe('createSerialQueue', () => {
  // The queue cannot tell a nested call from a concurrent one, so a nested
  // call waits on its own outer task. It must fail, not hang, and the queue
  // must keep working afterwards.
  it('fails a call that waits on its own outer task, then carries on', async () => {
    const queue = createSerialQueue({ waitMs: 50 });

    await expect(queue.run(async () => queue.run(async () => 'inner'))).rejects.toThrow(
      /use its `tx`/,
    );

    await expect(queue.run(async () => 'next')).resolves.toBe('next');
  });
});
