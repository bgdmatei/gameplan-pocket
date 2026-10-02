// Bundles the API for deployment: the server and the migration CLI, each one
// file in dist/. Workspace packages (@gameplan/*) are TypeScript source with
// no build of their own, so they are bundled in; npm dependencies stay
// external and load from node_modules, which the deploy installs.
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((name) => !name.startsWith('@gameplan/'));

await build({
  entryPoints: { index: 'src/index.ts', migrate: 'src/db/migrate-cli.ts' },
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external,
  sourcemap: true,
  logLevel: 'info',
});
