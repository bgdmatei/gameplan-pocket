#!/usr/bin/env node
// Proves "secrets never ship to clients" with a mechanism, not an intention
// (SPEC-map.md §Security): exports the mobile bundle and searches its bytes
// for the API's secret names and, when apps/api/.env or .env.staging exist,
// their values. With apps/mobile/.env.staging present, a second bundle is
// exported with those values loaded, as `ios:staging` builds it: a staging
// secret would reach the app through that file.
//
// A positive control ("Run the storage contract", on the home screen) must be
// found, or the search is not reading the bundle and a pass would mean nothing.
// Strings are searched as UTF-8 and UTF-16: Hermes bytecode stores either.
//
// Runs in CI on every push (names only, no .env there) and by hand with
// `pnpm check:secrets`, which also checks the values in the local env files.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// CATALOG_API_KEY is absent on purpose: it ships in the app by design.
const SECRET_NAMES = [
  'TWITCH_CLIENT_ID',
  'TWITCH_CLIENT_SECRET',
  'DATABASE_URL',
  // Auth (module 7): signing keys and the email provider's key.
  'JWT_SECRET',
  'CODE_SECRET',
  'RESEND_API_KEY',
];
const CONTROL = 'Run the storage contract';

/** NAME=value lines; a value may itself hold `=`, as a connection string's query does. */
const readEnv = (file) =>
  existsSync(file)
    ? readFileSync(file, 'utf8')
        .split('\n')
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()])
        .filter(([name]) => /^[A-Z_][A-Z0-9_]*$/.test(name))
    : [];

const values = ['.env', '.env.staging'].flatMap((file) =>
  readEnv(path.join(root, 'apps/api', file))
    .filter(([name, value]) => SECRET_NAMES.includes(name) && value.length >= 8)
    .map(([name, value]) => ({ label: `value of ${name} (apps/api/${file})`, text: value })),
);
const needles = [...SECRET_NAMES.map((name) => ({ label: name, text: name })), ...values];

const stagingApp = readEnv(path.join(root, 'apps/mobile/.env.staging'));
const builds = [
  { name: 'local', env: {} },
  ...(stagingApp.length > 0 ? [{ name: 'staging', env: Object.fromEntries(stagingApp) }] : []),
];

const out = mkdtempSync(path.join(tmpdir(), 'gameplan-bundle-'));
try {
  for (const build of builds) {
    for (const platform of ['ios', 'android']) {
      const result = spawnSync(
        'pnpm',
        [
          '--filter',
          'mobile',
          'exec',
          'expo',
          'export',
          '--platform',
          platform,
          // Metro's cache keeps EXPO_PUBLIC_* values inlined by an earlier
          // export whatever the environment now says; without this, the
          // staging bundle came back with the local values and a planted
          // secret went unseen.
          '--clear',
          '--output-dir',
          path.join(out, build.name, platform),
        ],
        // Variables already set win over apps/mobile/.env, as for `ios:staging`.
        { cwd: root, encoding: 'utf8', env: { ...process.env, ...build.env } },
      );
      if (result.status !== 0) {
        console.error(`FAIL: expo export (${build.name}, ${platform}) failed.\n${result.stderr}`);
        process.exit(1);
      }
    }
  }

  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(out);

  const contains = (text) =>
    files.filter((file) => {
      const bytes = readFileSync(file);
      return (
        bytes.includes(Buffer.from(text, 'utf8')) || bytes.includes(Buffer.from(text, 'utf16le'))
      );
    });

  if (contains(CONTROL).length === 0) {
    console.error(
      'FAIL: the positive control was not found; the search is not reading the bundle.',
    );
    process.exit(1);
  }

  let leaked = false;
  for (const { label, text } of needles) {
    const hits = contains(text);
    if (hits.length > 0) {
      leaked = true;
      console.error(`FAIL: ${label} found in ${hits.map((f) => path.relative(out, f)).join(', ')}`);
    }
  }
  if (leaked) process.exit(1);

  console.log(
    `OK: ${files.length} files in ${builds.map((b) => b.name).join(' and ')} bundles searched; ` +
      `${needles.length} secret names and values absent` +
      (values.length === 0 ? ' (no apps/api env files, so names only).' : '.'),
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
