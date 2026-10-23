import { describe, expect, it } from 'vitest';
import { composite, contrastRatio } from './contrast';
import { gradients, palettes, statusPalettes } from './palette';
import type { ColorScheme } from './palette';

/** WCAG 2.x AA for text. Every pair is held to it, display text included. */
const BODY = 4.5;

/** A name, a foreground, the background it sits on, and the ratio it needs. */
type Pair = readonly [name: string, fg: string, bg: string, min: number];

const pairs = (scheme: ColorScheme): Pair[] => {
  const c = palettes[scheme];
  const statuses = Object.values(statusPalettes[scheme]);
  return [
    ['text on background', c.text, c.background, BODY],
    ['text on surface', c.text, c.surface, BODY],
    ['text on raised', c.text, c.raised, BODY],
    ['text on frostedFill', c.text, c.frostedFill, BODY],
    ['muted on background', c.muted, c.background, BODY],
    ['muted on surface', c.muted, c.surface, BODY],
    ['muted on raised', c.muted, c.raised, BODY],
    ['muted on frostedFill', c.muted, c.frostedFill, BODY],
    ['accent on background', c.accent, c.background, BODY],
    ['accent on surface', c.accent, c.surface, BODY],
    ['accent on selectedFill', c.accent, c.selectedFill, BODY],
    ['onAccent on accentFill', c.onAccent, c.accentFill, BODY],
    ['noteLabel on noteFill', c.noteLabel, c.noteFill, BODY],
    ['muted on noteFill', c.muted, c.noteFill, BODY],
    ['danger on surface', c.danger, c.surface, BODY],
    ['danger on background', c.danger, c.background, BODY],
    ...statuses.flatMap((status): Pair[] => [
      [`status ${status} on surface`, status, c.surface, BODY],
      [`status ${status} on background`, status, c.background, BODY],
      [`status ${status} on raised`, status, c.raised, BODY],
    ]),
  ];
};

describe('theme contrast', () => {
  it('measures the extremes as WCAG does', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });

  // Every text and icon colour meets AA against every surface it sits on, in
  // both themes: a token changed below that fails here, not in someone's eyes.
  it.each(['dark', 'light'] as const)('%s theme meets AA for every pair', (scheme) => {
    const failing = pairs(scheme)
      .map(([name, fg, bg, min]) => ({ name, ratio: contrastRatio(fg, bg), min }))
      .filter(({ ratio, min }) => ratio < min)
      .map(({ name, ratio, min }) => `${name}: ${ratio.toFixed(2)} < ${min}`);
    expect(failing).toEqual([]);
  });

  // Text never sits on raw cover art (spec boundary). Where text starts, the
  // gradient must make even a pure white cover dark enough for white text.
  it.each(['dark', 'light'] as const)(
    '%s theme: text over the image gradient reads on a white cover',
    (scheme) => {
      const c = palettes[scheme];
      const behindText = composite(gradients.overImage.textStop, '#FFFFFF');
      expect(contrastRatio(c.onImage, behindText)).toBeGreaterThanOrEqual(BODY);
      expect(contrastRatio(c.onImageMuted, behindText)).toBeGreaterThanOrEqual(BODY);
    },
  );
});
