import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueueFullError, createRateLimitedQueue } from './queue';

afterEach(() => {
  vi.useRealTimers();
});

describe('rate-limited queue', () => {
  // The attack: a burst of 50 distinct searches. IGDB must never see more than
  // 4 starts in any second or 8 open requests, and the overflow is refused at
  // once rather than left waiting.
  it('holds IGDB limits under a burst, and refuses what would wait too long', async () => {
    vi.useFakeTimers();
    const queue = createRateLimitedQueue({ perSecond: 4, maxInFlight: 8, maxWaiting: 20 });
    const starts: number[] = [];
    let active = 0;
    let mostActive = 0;

    // Slow requests (3 s), so the in-flight cap is reached too.
    const request = async (): Promise<void> => {
      starts.push(Date.now());
      active += 1;
      mostActive = Math.max(mostActive, active);
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      active -= 1;
    };

    const outcomes = Array.from({ length: 50 }, () =>
      queue.run(request).then(
        () => 'done',
        (error: unknown) => (error instanceof QueueFullError ? 'refused' : 'failed'),
      ),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    const results = await Promise.all(outcomes);

    // 4 start at once and 20 wait; the other 26 are refused immediately.
    expect(results.filter((r) => r === 'done')).toHaveLength(24);
    expect(results.filter((r) => r === 'refused')).toHaveLength(26);
    expect(mostActive).toBeLessThanOrEqual(8);
    for (const start of starts) {
      expect(starts.filter((s) => s >= start && s < start + 1_000).length).toBeLessThanOrEqual(4);
    }
  });
});
