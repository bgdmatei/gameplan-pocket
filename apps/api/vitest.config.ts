import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['src/testing/global-setup.ts'],
    // The first run pulls the Postgres image.
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/testing/**'],
      // A hint, not a target: no thresholds (CLAUDE.md §Testing).
      reporter: ['text'],
    },
  },
});
