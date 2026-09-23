import type { SyncEnv } from '../store/entities';

export type FakeEnv = SyncEnv & { advance: (ms: number) => void };

/**
 * A clock that moves only when told, and random bytes that are a pure
 * function of the seed and how many were asked for before: every run is
 * replayable. Give each simulated device its own seed, or they share a node id.
 */
export const fakeEnv = (startMs = Date.UTC(2026, 8, 23, 10), seed = 0): FakeEnv => {
  let nowMs = startMs;
  let drawn = 0;

  return {
    now: () => nowMs,
    advance: (ms) => {
      nowMs += ms;
    },
    randomBytes: (length) =>
      Uint8Array.from({ length }, () => (drawn++ * 97 + 13 + seed * 7_919) % 256),
  };
};
