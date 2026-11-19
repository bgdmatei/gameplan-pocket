#!/usr/bin/env node
// Bundles the phone's sync code as it was at one commit, so a test can run
// what installed phones run against today's server (ADR-017, N-1 test).
//
//   node scripts/pin-client.mjs <commit> <protocol>
//
// Writes apps/api/src/sync/compat/client-v<protocol>.bundle.js. The commit's
// own workspace packages are bundled from `git archive`; third-party packages
// (zod, uuid) come from this checkout's node_modules, so nothing is fetched;
// the pin fails unless the commit's lockfile has those exact versions.
// Re-pinning from another commit is ask-first (SPEC-schema-evolution.md).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [commit, protocol] = process.argv.slice(2);
if (commit === undefined || !/^\d+$/.test(protocol ?? '')) {
  console.error('Usage: node scripts/pin-client.mjs <commit> <protocol>');
  process.exit(1);
}

const git = (...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
};

const sha = git('rev-parse', '--verify', `${commit}^{commit}`);
// Real path: macOS's temp folder is a symlink, and esbuild reports importers resolved.
const tree = realpathSync(mkdtempSync(path.join(tmpdir(), 'pin-client-')));

// The phone's HTTP client lives in the app; its folder comes along for any sibling it imports.
const SYNC_API = 'apps/mobile/src/data/sync-api.ts';
const archive = spawnSync(
  'git',
  ['archive', '--format=tar', sha, 'packages', path.dirname(SYNC_API), 'pnpm-lock.yaml'],
  { cwd: root, maxBuffer: 256 * 1024 * 1024 },
);
if (archive.status !== 0) throw new Error(`git archive: ${archive.stderr}`);
const untar = spawnSync('tar', ['-x', '-C', tree], { input: archive.stdout });
if (untar.status !== 0) throw new Error(`tar: ${untar.stderr}`);

const ENTRY = `
export { commitLocalCreate, commitLocalEdit, entryId, syncOnce } from '@gameplan/sync';
export { createMigratedNodeAdapter } from '@gameplan/storage/node';
export { createEntry } from '@gameplan/domain';
export { createSyncApi } from './${SYNC_API}';
`;

const lockfile = readFileSync(path.join(tree, 'pnpm-lock.yaml'), 'utf8');
const checked = new Set();

/** The installed package must be the version the commit's lockfile names. */
const checkLocked = (spec, resolvedPath) => {
  const name = spec
    .split('/')
    .slice(0, spec.startsWith('@') ? 2 : 1)
    .join('/');
  if (checked.has(name)) return;
  let dir = path.dirname(resolvedPath);
  while (!existsSync(path.join(dir, 'package.json')) || readJson(dir).name !== name) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`No package.json for ${name}`);
    dir = parent;
  }
  const { version } = readJson(dir);
  if (!lockfile.includes(`\n  ${name}@${version}:`)) {
    throw new Error(
      `${name}@${version} is installed, but ${sha.slice(0, 7)} locked another version`,
    );
  }
  checked.add(name);
};

const readJson = (dir) => JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));

/** `@gameplan/<pkg>[/<sub>]` → the archived package's own export map. */
const workspace = {
  name: 'archived-workspace',
  setup: (build) => {
    build.onResolve({ filter: /^@gameplan\// }, ({ path: spec }) => {
      const [, name, ...sub] = spec.split('/');
      const dir = path.join(tree, 'packages', name);
      const { exports } = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
      const target = exports?.[sub.length === 0 ? '.' : `./${sub.join('/')}`];
      if (typeof target !== 'string') throw new Error(`${spec} isn't exported at ${sha}`);
      return { path: path.join(dir, target) };
    });
    // A bare import from an archived package resolves from the same package
    // in this checkout, where pnpm has linked its dependencies.
    build.onResolve({ filter: /^[^./]/ }, async ({ path: spec, importer, kind }) => {
      if (spec.startsWith('node:') || !importer.startsWith(tree)) return undefined;
      const relative = path.relative(tree, importer).split(path.sep);
      const owner = relative[0] === 'packages' ? relative.slice(0, 2) : ['apps', 'mobile'];
      const resolved = await build.resolve(spec, { kind, resolveDir: path.join(root, ...owner) });
      if (resolved.errors.length === 0) checkLocked(spec, resolved.path);
      return resolved;
    });
  },
};

const require = createRequire(path.join(root, 'apps/api/package.json'));
const esbuild = require('esbuild');
const out = path.join(root, `apps/api/src/sync/compat/client-v${protocol}.bundle.js`);

try {
  const result = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: tree, sourcefile: 'pinned-entry.ts', loader: 'ts' },
    // Module comments are relative to the repo; the temp folder is renamed below.
    absWorkingDir: root,
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node24',
    // Non-ASCII escaped: a raw control character makes git call the file binary.
    charset: 'ascii',
    external: ['node:*'],
    plugins: [workspace],
    legalComments: 'none',
    // The archived tsconfigs extend @gameplan/config, which isn't in the archive.
    tsconfigRaw: {},
    logLevel: 'warning',
  });
  const [file] = result.outputFiles;
  // The temp folder's name is random: without this, every re-pin would differ.
  const text = file.text.replaceAll(path.relative(root, tree), `<${sha.slice(0, 7)}>`);
  // compat/pinned-bundle.test.ts recomputes it, so any edit after pinning fails the tests.
  const bodySha = createHash('sha256').update(text).digest('hex');
  const header = [
    '// GENERATED: the phone sync client pinned for the N-1 test (ADR-017). Do not edit.',
    `// Commit ${sha} (protocol ${protocol}).`,
    `// Rebuild: node scripts/pin-client.mjs ${sha.slice(0, 7)} ${protocol}`,
    `// Body SHA-256: ${bodySha}`,
    '',
  ].join('\n');
  writeFileSync(out, header + text);
  console.log(`Pinned ${sha.slice(0, 7)} → ${path.relative(root, out)}`);
} finally {
  rmSync(tree, { recursive: true, force: true });
}
