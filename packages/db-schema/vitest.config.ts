import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Real tests land in T2/T3; the package is wired up first.
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.suite.ts', 'src/testing/**'],
      reporter: ['text', 'html'],
      thresholds: { lines: 90 },
    },
  },
});
