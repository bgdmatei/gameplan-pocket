// Boundary violation fixture: sync importing from an app (api) via a relative
// path. MUST fail `boundaries/dependencies`.
// Used by scripts/check-boundaries.mjs and excluded from `eslint src`.
//
// Relative path + `.ts` extension for the same reasons as the other fixtures;
// see packages/test-utils/tests/fixtures/pkg-imports-app.ts.
import '../../../../apps/api/src/index.ts';

export {};
