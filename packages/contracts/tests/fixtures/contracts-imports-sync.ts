// Boundary violation fixture: contracts importing sync via a relative path.
// MUST fail `boundaries/dependencies`. Used by scripts/check-boundaries.mjs and
// intentionally excluded from `eslint src`. sync may import contracts, so this
// pins the direction. Relative path + `.ts` extension for the same reasons as
// packages/test-utils/tests/fixtures/pkg-imports-app.ts.
import '../../../sync/src/index.ts';

export {};
