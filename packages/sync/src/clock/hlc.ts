/**
 * Hybrid logical clock (ADR-007). Orders edits across devices whose wall
 * clocks disagree: it follows real time when it can, and a counter when two
 * edits share a millisecond or a device's clock runs behind one it has heard
 * from.
 *
 * Clocks travel and are stored as fixed-width strings, so plain string
 * comparison is clock comparison — in SQLite, in JSON and in JavaScript:
 *
 *   000001790000000:00000:3f9a2c1b7d4e8f60
 *   wall ms (15)    count  node id (16 hex)
 */
export type Hlc = { wallMs: number; counter: number; nodeId: string };

const WALL_DIGITS = 15;
const COUNTER_DIGITS = 5;
const MAX_WALL_MS = 10 ** WALL_DIGITS - 1;
const MAX_COUNTER = 10 ** COUNTER_DIGITS - 1;
const HLC_PATTERN = /^(\d{15}):(\d{5}):([0-9a-f]{16})$/;
const NODE_ID_PATTERN = /^[0-9a-f]{16}$/;

/** The plan's example: a remote clock more than a minute ahead is suspect. */
export const DEFAULT_MAX_DRIFT_MS = 60_000;

const assertNodeId = (nodeId: string): void => {
  if (!NODE_ID_PATTERN.test(nodeId)) {
    throw new Error(`A node id is 16 lowercase hex characters, got "${nodeId}".`);
  }
};

const assertWallMs = (wallMs: number): void => {
  if (!Number.isSafeInteger(wallMs) || wallMs < 0 || wallMs > MAX_WALL_MS) {
    throw new Error(`A clock's wall time must be whole milliseconds, got ${wallMs}.`);
  }
};

export const formatHlc = ({ wallMs, counter, nodeId }: Hlc): string => {
  assertWallMs(wallMs);
  assertNodeId(nodeId);
  if (!Number.isSafeInteger(counter) || counter < 0 || counter > MAX_COUNTER) {
    throw new Error(`A clock's counter must be 0 to ${MAX_COUNTER}, got ${counter}.`);
  }

  const wall = String(wallMs).padStart(WALL_DIGITS, '0');
  return `${wall}:${String(counter).padStart(COUNTER_DIGITS, '0')}:${nodeId}`;
};

export const parseHlc = (text: string): Hlc => {
  const match = HLC_PATTERN.exec(text);
  if (match === null) throw new Error(`Not a clock value: "${text}".`);

  const [, wall = '', counter = '', nodeId = ''] = match;
  return { wallMs: Number(wall), counter: Number(counter), nodeId };
};

export const isHlc = (text: string): boolean => HLC_PATTERN.test(text);

export const compareHlc = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Builds the next clock value. A counter that would run past its width moves
 * the wall on by a millisecond instead: still later than everything before it,
 * and 100,000 edits in one millisecond means something else is wrong.
 */
const next = (wallMs: number, counter: number, nodeId: string): string =>
  counter > MAX_COUNTER
    ? formatHlc({ wallMs: wallMs + 1, counter: 0, nodeId })
    : formatHlc({ wallMs, counter, nodeId });

/**
 * The clock for a local edit. Always later than `last`, even when the device's
 * clock has gone backwards since, so this device never issues a value twice.
 */
export const tick = (last: string | null, nowMs: number, nodeId: string): string => {
  assertWallMs(nowMs);
  if (last === null) return next(nowMs, 0, nodeId);

  const previous = parseHlc(last);
  if (nowMs > previous.wallMs) return next(nowMs, 0, nodeId);
  return next(previous.wallMs, previous.counter + 1, nodeId);
};

/**
 * Moves this device's clock past one it has just received, so its next edit
 * sorts after everything it has seen. Never rejects: a pulled op is applied
 * whatever its clock says, or devices would stop converging. The drift guard
 * belongs at the server's door (`isTooFarAhead`).
 */
export const receive = (
  last: string | null,
  remote: string,
  nowMs: number,
  nodeId: string,
): string => {
  assertWallMs(nowMs);
  const theirs = parseHlc(remote);
  const ours = last === null ? null : parseHlc(last);

  const wallMs = Math.max(nowMs, theirs.wallMs, ours?.wallMs ?? -1);
  const fromOurs = ours !== null && ours.wallMs === wallMs ? ours.counter + 1 : 0;
  const fromTheirs = theirs.wallMs === wallMs ? theirs.counter + 1 : 0;

  return next(wallMs, Math.max(fromOurs, fromTheirs), nodeId);
};

/**
 * True when a clock claims a time too far past `nowMs` to trust. For the
 * server to call before an op enters the log — the one place refusing it
 * cannot split devices apart.
 */
export const isTooFarAhead = (
  hlc: string,
  nowMs: number,
  maxDriftMs: number = DEFAULT_MAX_DRIFT_MS,
): boolean => parseHlc(hlc).wallMs > nowMs + maxDriftMs;
