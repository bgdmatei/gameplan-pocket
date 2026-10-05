import { describe, expect, it } from 'vitest';
import { perfSummary, record, resetPerf } from './perf';

describe('perf', () => {
  // Worst means slowest for a time and lowest for a frame rate, and only the
  // recent samples count, so a fix shows up without restarting the app.
  it('summarises recent samples, worst in the direction the budget cares about', () => {
    resetPerf();
    [30, 10, 20].forEach((ms) => record('search', ms));
    [60, 45, 58].forEach((fps) => record('scrollFps', fps));
    for (let i = 0; i < 60; i += 1) record('filter', i < 10 ? 999 : 5);

    const summary = perfSummary();
    expect(summary.search).toMatchObject({ count: 3, median: 20, worst: 30 });
    expect(summary.scrollFps).toMatchObject({ count: 3, median: 58, worst: 45 });
    expect(summary.filter).toMatchObject({ count: 50, worst: 5 });
    expect(summary.write).toMatchObject({ count: 0, median: null, worst: null });
  });
});
