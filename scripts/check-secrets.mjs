#!/usr/bin/env node
// Proves "secrets never ship to clients" with a mechanism, not an intention
// (SPEC-map.md §Security): exports the mobile bundle and searches its bytes
// for the API's secret names and, when apps/api/.env exists, their values.
//
// A positive control ("Run the storage contract", on the home screen) must be
// found, or the search is not reading the bundle and a pass would mean nothing.
// Strings are searched as UTF-8 and UTF-16: Hermes bytecode stores either.
//
// Runs in CI on every push (names only, no .env there) and by hand with
// `pnpm check:secrets`, which also checks the values in apps/api/.env.
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

const envFile = path.join(root, 'apps/api/.env');
const values = existsSync(envFile)
  ? readFileSync(envFile, 'utf8')
      .split('\n')
      .map((line) => line.split('='))
      .filter(([name, value]) => SECRET_NAMES.includes(name) && value && value.length >= 8)
      .map(([name, value]) => ({ label: `value of ${name}`, text: value.trim() }))
  : [];
const needles = [...SECRET_NAMES.map((name) => ({ label: name, text: name })), ...values];

const out = mkdtempSync(path.join(tmpdir(), 'gameplan-bundle-'));
try {
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
        '--output-dir',
        path.join(out, platform),
      ],
      { cwd: root, encoding: 'utf8' },
    );
    if (result.status !== 0) {
      console.error(`FAIL: expo export for ${platform} failed.\n${result.stderr}`);
      process.exit(1);
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
    `OK: ${files.length} bundle files searched; ${needles.length} secret names and values absent` +
      (values.length === 0 ? ' (no apps/api/.env, so names only).' : '.'),
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
