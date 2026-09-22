import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/testing/**',
        // The phone's implementation cannot run here: it is a native module.
        // The device contract run is its check instead.
        'src/op-sqlite/**',
      ],
      // A hint, not a target: no thresholds (CLAUDE.md §Testing).
      reporter: ['text'],
    },
  },
});
