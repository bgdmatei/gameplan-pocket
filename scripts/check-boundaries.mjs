#!/usr/bin/env node
// Invert-exit CI helper: lints the boundary-violation fixture and expects it
// to FAIL via `boundaries/dependencies`. If the fixture passes, the rule
// isn't enforcing pkg → app imports and CI should break.
//
// Only the relative-path shape is lint-tested. Package-specifier imports
// (`import 'api'`) can't reach the lint rule because apps have no
// main/exports entry — the specifier fails module resolution first. See the
// fixture header for details.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = 'packages/test-utils/tests/fixtures/pkg-imports-app.ts';

const result = spawnSync('pnpm', ['exec', 'eslint', '--no-warn-ignored', fixture], {
  cwd: root,
  encoding: 'utf8',
});

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

if (result.status === 0) {
  console.error(`FAIL: fixture ${fixture} unexpectedly passed lint.`);
  console.error('boundaries/dependencies is not catching pkg → app imports.');
  console.error(output);
  process.exit(1);
}

if (!output.includes('boundaries/dependencies')) {
  console.error(`FAIL: fixture ${fixture} errored, but not via boundaries/dependencies.`);
  console.error(output);
  process.exit(1);
}

console.log(`OK: fixture ${fixture} correctly flagged by boundaries/dependencies.`);
process.exit(0);
