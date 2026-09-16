// Boundary violation fixture: pkg (test-utils) importing from app (api).
// This file MUST fail `boundaries/dependencies`. Used by scripts/check-boundaries.mjs.
// It is intentionally excluded from `eslint src`.
import '../../../../apps/api/src/index.ts';

export {};
