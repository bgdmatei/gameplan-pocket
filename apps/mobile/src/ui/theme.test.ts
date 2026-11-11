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
    ['danger on frostedFill', c.danger, c.frostedFill, BODY],
    ['accent on frostedFill', c.accent, c.frostedFill, BODY],
    // The Library sync icon (#23) on its frosted button.
    ['success on frostedFill', c.success, c.frostedFill, BODY],
    ['warning on frostedFill', c.warning, c.frostedFill, BODY],
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
    // Toasts: their text and icon on each tone's fill.
    ...(['dangerFill', 'successFill', 'warningFill'] as const).map((fill): Pair => [
      `text on ${fill}`,
      c.text,
      c[fill],
      BODY,
    ]),
    ['danger on dangerFill', c.danger, c.dangerFill, BODY],
    ['success on successFill', c.success, c.successFill, BODY],
    ['warning on warningFill', c.warning, c.warningFill, BODY],
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

  // Frosted chrome blurs whatever scrolls beneath it, covers included. Its tint
  // must carry the labels on its own, over the worst content: white behind the
  // dark bar, black behind the light one. Found when the first tab bar
  // screenshot showed a bright cover bleeding through behind a grey label.
  it.each(['dark', 'light'] as const)(
    '%s theme: frosted labels read over any content behind them',
    (scheme) => {
      const c = palettes[scheme];
      for (const behind of ['#FFFFFF', '#000000']) {
        const ground = composite(c.frostedTint, behind);
        expect(contrastRatio(c.text, ground)).toBeGreaterThanOrEqual(BODY);
        expect(contrastRatio(c.muted, ground)).toBeGreaterThanOrEqual(BODY);
        expect(contrastRatio(c.accent, ground)).toBeGreaterThanOrEqual(BODY);
        // A problem toast's icon, frosted over the screen.
        expect(contrastRatio(c.danger, ground)).toBeGreaterThanOrEqual(BODY);
        // The Library sync icon's other tones (#23).
        expect(contrastRatio(c.success, ground)).toBeGreaterThanOrEqual(BODY);
        expect(contrastRatio(c.warning, ground)).toBeGreaterThanOrEqual(BODY);
      }
    },
  );

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
