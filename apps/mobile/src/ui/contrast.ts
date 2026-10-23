/**
 * WCAG 2.x contrast for the theme test. Pure: no React Native, so Vitest can
 * load it. Accepts `#RRGGBB` and `rgba(r, g, b, a)`, the two forms the palette uses.
 */

type Rgba = { r: number; g: number; b: number; a: number };

const parse = (colour: string): Rgba => {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(colour);
  if (hex !== null) {
    const [, r = '0', g = '0', b = '0'] = hex;
    return { r: parseInt(r, 16), g: parseInt(g, 16), b: parseInt(b, 16), a: 1 };
  }
  const rgba = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/.exec(colour);
  if (rgba !== null) {
    const [, r = '0', g = '0', b = '0', a = '1'] = rgba;
    return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) };
  }
  throw new Error(`Not a colour the palette uses: ${colour}`);
};

const toHex = ({ r, g, b }: Rgba): string =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

const channel = (value: number): number => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = (colour: string): number => {
  const { r, g, b } = parse(colour);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/** `top` (possibly translucent) laid over an opaque `bottom`, as the eye sees it. */
export const composite = (top: string, bottom: string): string => {
  const t = parse(top);
  const b = parse(bottom);
  const mix = (front: number, back: number): number => front * t.a + back * (1 - t.a);
  return toHex({ r: mix(t.r, b.r), g: mix(t.g, b.g), b: mix(t.b, b.b), a: 1 });
};

/** From 1 (none) to 21 (black on white). Translucent colours count as laid on white. */
export const contrastRatio = (a: string, b: string): number => {
  const [x, y] = [luminance(composite(a, '#FFFFFF')), luminance(composite(b, '#FFFFFF'))];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
