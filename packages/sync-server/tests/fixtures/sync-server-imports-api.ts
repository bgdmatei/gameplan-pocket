// Boundary violation fixture: sync-server importing the API, where the
// database code lives. MUST fail `boundaries/dependencies`: sync-server stays
// pure and reaches only sync, contracts and domain (ADR-023). Used by
// scripts/check-boundaries.mjs and outside `eslint src`. Relative path + `.ts`
// extension for the same reasons as packages/test-utils/tests/fixtures/pkg-imports-app.ts.
import '../../../../apps/api/src/db/client.ts';

export {};
