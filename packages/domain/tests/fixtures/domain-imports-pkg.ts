// Boundary violation fixture: domain importing another workspace package
// (test-utils) via a relative path. MUST fail `boundaries/dependencies`.
// Used by scripts/check-boundaries.mjs and intentionally excluded from `eslint src`.
//
// Relative path + `.ts` extension for the same reasons as
// packages/test-utils/tests/fixtures/pkg-imports-app.ts. Package-specifier
// imports (`@gameplan/*`) are caught separately by `no-restricted-imports`
// in packages/domain/eslint.config.js.
import '../../../test-utils/src/index.ts';

export {};
