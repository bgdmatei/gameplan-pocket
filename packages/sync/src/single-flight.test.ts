import { describe, expect, it, vi } from 'vitest';
import { createSingleFlight } from './single-flight';

describe('createSingleFlight', () => {
  it('never overlaps runs, and folds calls made mid-run into one trailing run', async () => {
    const release: (() => void)[] = [];
    let active = 0;
    let mostActive = 0;
    let runs = 0;

    const task = async (): Promise<void> => {
      active += 1;
      runs += 1;
      mostActive = Math.max(mostActive, active);
      await new Promise<void>((resolve) => release.push(resolve));
      active -= 1;
    };

    const run = createSingleFlight();
    const first = run(task);
    const second = run(task);
    const third = run(task);
    expect(third).toBe(second);

    release.shift()?.();
    await first;
    await vi.waitFor(() => expect(release).toHaveLength(1));
    release.shift()?.();
    await second;

    expect(runs).toBe(2);
    expect(mostActive).toBe(1);
  });
});
