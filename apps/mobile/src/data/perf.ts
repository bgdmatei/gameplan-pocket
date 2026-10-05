/**
 * Performance marks for T19 (plan §12.1), measured in the build that ships
 * and read off the debug screen. Numbers only: no names, notes or queries.
 *
 * `performance.now()` here starts when this module is first evaluated, which
 * the root layout does at once, so the cold start it reports is the JS part:
 * native launch before the bundle runs is measured with Instruments.
 */
const APP_START = performance.now();

export type Metric = 'coldStart' | 'search' | 'filter' | 'write' | 'scrollFps';

type Budget = { limit: number; unit: 'ms' | 'fps'; better: 'lower' | 'higher' };

export const BUDGETS: Readonly<Record<Metric, Budget>> = {
  coldStart: { limit: 2_000, unit: 'ms', better: 'lower' },
  search: { limit: 50, unit: 'ms', better: 'lower' },
  filter: { limit: 100, unit: 'ms', better: 'lower' },
  write: { limit: 16, unit: 'ms', better: 'lower' },
  scrollFps: { limit: 58, unit: 'fps', better: 'higher' },
};

export const METRICS = Object.keys(BUDGETS) as Metric[];

/** Only recent samples count, so a fix shows without restarting the app. */
const KEEP = 50;
const samples = new Map<Metric, number[]>();

export const record = (metric: Metric, value: number): void => {
  const list = [...(samples.get(metric) ?? []), value];
  samples.set(metric, list.slice(-KEEP));
};

export const resetPerf = (): void => samples.clear();

/**
 * Starts timing; the returned function stops it on the next frame, so the
 * sample includes getting the change onto the screen. Stopping twice records
 * once.
 */
export const startTimer = (metric: Metric): (() => void) => {
  const started = performance.now();
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    requestAnimationFrame(() => record(metric, performance.now() - started));
  };
};

let interactive = false;

/** The library's first page is on screen: the end of a cold start, once per launch. */
export const markLibraryInteractive = (): void => {
  if (interactive) return;
  interactive = true;
  requestAnimationFrame(() => record('coldStart', performance.now() - APP_START));
};

export type Summary = { count: number; median: number | null; worst: number | null };

export const perfSummary = (): Record<Metric, Summary> => {
  const entries = METRICS.map((metric): [Metric, Summary] => {
    const values = [...(samples.get(metric) ?? [])].sort((a, b) => a - b);
    if (values.length === 0) return [metric, { count: 0, median: null, worst: null }];
    const worst = BUDGETS[metric].better === 'lower' ? values.at(-1) : values[0];
    return [
      metric,
      {
        count: values.length,
        median: values[Math.floor(values.length / 2)] ?? null,
        worst: worst ?? null,
      },
    ];
  });
  return Object.fromEntries(entries) as Record<Metric, Summary>;
};

/** Hermes' own heap size in bytes, or null on an engine that doesn't report it. */
export const jsHeapBytes = (): number | null => {
  const hermes: unknown = (globalThis as { HermesInternal?: unknown }).HermesInternal;
  if (typeof hermes !== 'object' || hermes === null || !('getInstrumentedStats' in hermes)) {
    return null;
  }
  const getStats = hermes.getInstrumentedStats;
  if (typeof getStats !== 'function') return null;
  const stats: unknown = getStats.call(hermes);
  if (typeof stats !== 'object' || stats === null || !('js_heapSize' in stats)) return null;
  return typeof stats.js_heapSize === 'number' ? stats.js_heapSize : null;
};

let heapBaseline: number | null = null;

/** Notes the heap now, to compare after scrolling: kept here, since the grid is another screen. */
export const setHeapBaseline = (): void => {
  heapBaseline = jsHeapBytes();
};

export const getHeapBaseline = (): number | null => heapBaseline;

/** A scroll counts as over when no scroll event arrived for this long. */
const SCROLL_IDLE_MS = 250;
const FPS_WINDOW_MS = 1_000;

/**
 * Counts JS frames while a list scrolls and records frames per second for
 * every full second of scrolling. Call the returned function from `onScroll`.
 * A partial second at the end is dropped: too short to mean anything.
 */
export const createScrollFpsMeter = (): (() => void) => {
  let lastScroll = 0;
  let running = false;
  let frames = 0;
  let windowStart = 0;

  const tick = (): void => {
    const now = performance.now();
    frames += 1;
    if (now - windowStart >= FPS_WINDOW_MS) {
      record('scrollFps', (frames * 1_000) / (now - windowStart));
      frames = 0;
      windowStart = now;
    }
    if (now - lastScroll < SCROLL_IDLE_MS) requestAnimationFrame(tick);
    else running = false;
  };

  return () => {
    lastScroll = performance.now();
    if (running) return;
    running = true;
    frames = 0;
    windowStart = lastScroll;
    requestAnimationFrame(tick);
  };
};
