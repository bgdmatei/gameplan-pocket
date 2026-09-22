#!/usr/bin/env node
// Invert-exit CI helper: lints each boundary-violation fixture and expects it
// to FAIL via `boundaries/dependencies`. If a fixture passes, the rule isn't
// enforcing that dependency direction and CI should break.
//
// Only the relative-path shape is lint-tested. Package-specifier imports
// (`import 'api'`) can't reach the lint rule because apps have no
// main/exports entry — the specifier fails module resolution first. See the
// fixture headers for details.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = [
  // pkg → app
  'packages/test-utils/tests/fixtures/pkg-imports-app.ts',
  // domain → any other workspace package
  'packages/domain/tests/fixtures/domain-imports-pkg.ts',
  // storage → a package outside domain/db-schema
  'packages/storage/tests/fixtures/storage-imports-pkg.ts',
  // db-schema → anything at all
  'packages/db-schema/tests/fixtures/db-schema-imports-domain.ts',
];

let failed = false;

for (const fixture of fixtures) {
  const result = spawnSync('pnpm', ['exec', 'eslint', '--no-warn-ignored', fixture], {
    cwd: root,
    encoding: 'utf8',
  });

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

  if (result.status === 0) {
    console.error(`FAIL: fixture ${fixture} unexpectedly passed lint.`);
    console.error('boundaries/dependencies is not catching this dependency direction.');
    console.error(output);
    failed = true;
  } else if (!output.includes('boundaries/dependencies')) {
    console.error(`FAIL: fixture ${fixture} errored, but not via boundaries/dependencies.`);
    console.error(output);
    failed = true;
  } else {
    console.log(`OK: fixture ${fixture} correctly flagged by boundaries/dependencies.`);
  }
}

process.exit(failed ? 1 : 0);
