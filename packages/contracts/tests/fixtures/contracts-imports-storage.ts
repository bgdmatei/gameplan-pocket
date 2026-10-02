// Boundary violation fixture: contracts importing storage via a relative path.
// MUST fail `boundaries/dependencies`. Used by scripts/check-boundaries.mjs and
// intentionally excluded from `eslint src`. Relative path + `.ts` extension for
// the same reasons as packages/test-utils/tests/fixtures/pkg-imports-app.ts.
import '../../../storage/src/index.ts';

export {};
