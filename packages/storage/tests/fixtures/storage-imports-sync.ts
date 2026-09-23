// Boundary violation fixture: storage importing sync. Sync is built on
// storage, never the other way round (SPEC-sync-core.md §Tech stack).
// MUST fail `boundaries/dependencies`.
// Used by scripts/check-boundaries.mjs and excluded from `eslint src`.
//
// Relative path + `.ts` extension for the same reasons as the other fixtures;
// see packages/test-utils/tests/fixtures/pkg-imports-app.ts.
import '../../../sync/src/index.ts';

export {};
