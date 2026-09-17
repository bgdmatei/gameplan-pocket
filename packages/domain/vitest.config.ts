import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/arbitraries.ts'],
      reporter: ['text', 'html'],
      thresholds: {
        lines: 90,
        // State machine and change function are fully covered (SPEC-domain-model.md §Testing strategy).
        'src/library-entry/status.ts': { lines: 100 },
        'src/library-entry/changes.ts': { lines: 100 },
      },
    },
  },
});
