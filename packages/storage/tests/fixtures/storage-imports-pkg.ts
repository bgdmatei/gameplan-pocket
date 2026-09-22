// Boundary violation fixture: storage importing a package it may not depend on
// (test-utils) via a relative path. MUST fail `boundaries/dependencies`.
// Used by scripts/check-boundaries.mjs and excluded from `eslint src`.
//
// Relative path + `.ts` extension for the same reasons as the other fixtures;
// see packages/test-utils/tests/fixtures/pkg-imports-app.ts.
import '../../../test-utils/src/index.ts';

export {};
