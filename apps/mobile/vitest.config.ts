import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Logic only: files under src/data and src/features that import no React
// Native. Screens are not rendered here (CLAUDE.md: don't test the framework).
export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/data/**/*.ts', 'src/features/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      // A hint, not a target: no thresholds (CLAUDE.md §Testing).
      reporter: ['text'],
    },
  },
});
