// Boundary violation fixture: the phone importing the server's sync logic.
// MUST fail `boundaries/dependencies`: only the API decides what enters the
// log (ADR-023). Used by scripts/check-boundaries.mjs and outside `eslint src`.
// Relative path + `.ts` extension for the same reasons as
// packages/test-utils/tests/fixtures/pkg-imports-app.ts.
import '../../../../packages/sync-server/src/index.ts';

export {};
