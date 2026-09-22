// Boundary violation fixture: db-schema importing domain. MUST fail
// `boundaries/dependencies`: db-schema is standalone so every client can load
// the schema without pulling in rules.
// Used by scripts/check-boundaries.mjs and excluded from `eslint src`.
import '../../../domain/src/index.ts';

export {};
