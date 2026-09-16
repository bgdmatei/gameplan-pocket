// Boundary violation fixture: pkg (test-utils) importing from app (api)
// via a relative path. MUST fail `boundaries/dependencies`.
// Used by scripts/check-boundaries.mjs and intentionally excluded from `eslint src`.
//
// Two notes on why this shape:
//   1. Relative path across workspaces is the only lint-testable shape.
//      A package-specifier import (`import 'api'`) is blocked at manifest
//      resolution — apps have no `main`/`exports` so the specifier can't
//      resolve, which means the lint rule never runs. That's a stronger
//      guarantee than a lint rule; no fixture is needed for it.
//   2. The extension is `.ts` (not the usual `.js`) because the default
//      eslint-plugin-boundaries resolver won't rewrite `.js` → `.ts`, so a
//      `.js` specifier would resolve to nothing and the rule would skip.
import '../../../../apps/api/src/index.ts';

export {};
