import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = path.dirname(fileURLToPath(import.meta.url));
const bundles = readdirSync(dir).filter((name) => name.endsWith('.bundle.js'));
const HASH_LINE = /^\/\/ Body SHA-256: ([0-9a-f]{64})\n/m;

// A Prettier run from apps/api (outside the root .prettierignore) once
// reformatted the whole bundle unnoticed: it changes only through pin-client.
describe('pinned client bundles', () => {
  it('finds at least one bundle to check', () => {
    expect(bundles).not.toEqual([]);
  });

  it.each(bundles)("%s's code is byte for byte what pin-client wrote", (name) => {
    const text = readFileSync(path.join(dir, name), 'utf8');
    const match = HASH_LINE.exec(text);
    expect(match, 'no Body SHA-256 line: re-pin with scripts/pin-client.mjs').not.toBeNull();
    const body = text.slice((match?.index ?? 0) + (match?.[0].length ?? 0));
    expect(createHash('sha256').update(body).digest('hex')).toBe(match?.[1]);
  });
});
