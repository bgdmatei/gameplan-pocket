import type { SyncEnv } from '../store/entities';

export type FakeEnv = SyncEnv & { advance: (ms: number) => void };

/**
 * A clock that moves only when told, and random bytes that are a pure
 * function of how many were asked for before: every run is replayable.
 */
export const fakeEnv = (startMs = Date.UTC(2026, 8, 23, 10)): FakeEnv => {
  let nowMs = startMs;
  let drawn = 0;

  return {
    now: () => nowMs,
    advance: (ms) => {
      nowMs += ms;
    },
    randomBytes: (length) => Uint8Array.from({ length }, () => (drawn++ * 97 + 13) % 256),
  };
};
