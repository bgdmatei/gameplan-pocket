import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Real tests land in T2/T3; the package is wired up first.
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.suite.ts',
        'src/testing/**',
        // The phone's implementation cannot run here: it is a native module.
        // It is held to the same contract instead, run on a device by the
        // debug screen (apps/mobile), which is where its coverage comes from.
        'src/op-sqlite/**',
      ],
      reporter: ['text', 'html'],
      thresholds: { lines: 90 },
    },
  },
});
