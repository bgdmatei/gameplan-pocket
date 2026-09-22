import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/arbitraries.ts'],
      // A hint, not a target: no thresholds (CLAUDE.md §Testing).
      reporter: ['text'],
    },
  },
});
