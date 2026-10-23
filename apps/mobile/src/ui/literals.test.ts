import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(import.meta.dirname, '..');

/** Where each kind of literal may live (visual-design criterion 10). */
const COLOURS_AND_FONTS_ALLOWED = ['ui/palette.ts', 'ui/theme.ts', 'ui/contrast.ts'];
const BLUR_ALLOWED = ['ui/components/frosted.tsx'];

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(entry) && !/\.test\.ts$/.test(entry) ? [full] : [];
  });

const offenders = (pattern: RegExp, allowed: string[]): string[] =>
  sources(SRC)
    .map((file) => path.relative(SRC, file))
    .filter((file) => !allowed.includes(file))
    .filter((file) => pattern.test(readFileSync(path.join(SRC, file), 'utf8')));

describe('visual literals', () => {
  // Every colour and font comes from the theme, so a redesign is one file and
  // the contrast test sees every colour the app can show.
  it('keeps colour and font-name literals in the theme', () => {
    expect(offenders(/['"`](#[0-9a-fA-F]{3,8}|rgba?\()/, COLOURS_AND_FONTS_ALLOWED)).toEqual([]);
    expect(offenders(/fontFamily:\s*['"`]/, COLOURS_AND_FONTS_ALLOWED)).toEqual([]);
  });

  // Blur is costly: one frosted wrapper, never a BlurView per list cell.
  it('uses expo-blur only through the frosted wrapper', () => {
    expect(offenders(/from ['"]expo-blur['"]/, BLUR_ALLOWED)).toEqual([]);
  });
});
