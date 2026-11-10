import type { EntryStatus } from '@gameplan/domain';

/**
 * Colours for the visual-design direction (SPEC-visual-design.md, 2026-10-23):
 * a near-black navy ground, covers carrying the colour behind dark gradients,
 * one warm gold accent for what is selected or open. Light is the same system
 * on a warm off-white ground with a deeper gold. Pure (no React Native) so the
 * contrast test can load it; `theme.ts` re-exports it with sizes and type.
 * Every pair is checked against WCAG AA by `theme.test.ts`.
 */

export type ColorScheme = 'light' | 'dark';

export type Colors = {
  /** The screen's ground. */
  background: string;
  /** Cards, sheets, chips at rest. */
  surface: string;
  /** One step above `surface`: inputs inside a card, a pressed row. */
  raised: string;
  /** What a frosted surface shows when blur is off (Reduce Transparency). */
  frostedFill: string;
  /**
   * Laid over the blur so labels read whatever scrolls beneath: opaque enough
   * that even a white cover (dark) or a black one (light) keeps text at AA.
   */
  frostedTint: string;
  text: string;
  /** Secondary text: captions, counts, locations. */
  muted: string;
  /** Hairlines, dividers, empty stars, chip borders. */
  line: string;
  /** Accent used as text or an icon: links, filled stars, selected labels. */
  accent: string;
  /** Accent used as a fill: the primary button, the open-note badge. */
  accentFill: string;
  /** Text and icons placed on `accentFill`. */
  onAccent: string;
  /** Behind a selected chip or the active tab: a soft gold tint. */
  selectedFill: string;
  /** Behind a note that is still open. */
  noteFill: string;
  /** The type label on an open note ("Puzzle · open"). */
  noteLabel: string;
  /** Destructive actions. Same hue as `dropped`. */
  danger: string;
  /** Text laid over cover art, always above the image gradient. */
  onImage: string;
  /** Secondary text over cover art: the uppercase label above a title. */
  onImageMuted: string;
  /** Where a hero image starts fading into `background`: the ground, fully transparent. */
  heroFadeFrom: string;
};

const dark: Colors = {
  background: '#0E0F14',
  surface: '#1A1C24',
  raised: '#252833',
  frostedFill: '#1A1C24',
  frostedTint: 'rgba(26, 28, 36, 0.9)',
  text: '#F6F3ED',
  muted: '#A4A3AF',
  line: '#2F3340',
  accent: '#F0BE62',
  accentFill: '#F0BE62',
  onAccent: '#1F1606',
  selectedFill: '#3A3122',
  noteFill: '#2B2518',
  noteLabel: '#F0BE62',
  danger: '#FF8A80',
  onImage: '#FFFFFF',
  onImageMuted: '#EDE7DD',
  heroFadeFrom: 'rgba(14, 15, 20, 0)',
};

const light: Colors = {
  background: '#F7F3EC',
  surface: '#FFFFFF',
  raised: '#EFE9DE',
  frostedFill: '#FFFFFF',
  frostedTint: 'rgba(255, 255, 255, 0.93)',
  text: '#1C1914',
  muted: '#686154',
  line: '#E3DACB',
  // The yellowest gold that still reads as text on every light surface (AA).
  accent: '#7F6400',
  // Fills can be true gold: dark text on them, as in the dark theme.
  accentFill: '#E6B043',
  onAccent: '#1F1606',
  selectedFill: '#F3E6C8',
  noteFill: '#F6ECD6',
  noteLabel: '#7A4F00',
  danger: '#B3261E',
  onImage: '#FFFFFF',
  onImageMuted: '#EFEAE2',
  heroFadeFrom: 'rgba(247, 243, 236, 0)',
};

export const palettes: Record<ColorScheme, Colors> = { dark, light };

/**
 * Status colours carry meaning, not brand, so they only shift in lightness
 * between themes. Always shown with the status label: colour alone would fail
 * anyone who can't tell them apart.
 */
export const statusPalettes: Record<ColorScheme, Record<EntryStatus, string>> = {
  dark: {
    wishlist: '#C4A6FF',
    backlog: '#AEB6C4',
    playing: '#7DB6FF',
    paused: '#F2B544',
    completed: '#6FD39A',
    dropped: '#FF8A80',
  },
  light: {
    wishlist: '#7A4FC0',
    backlog: '#56606E',
    playing: '#1B5FBF',
    paused: '#945700',
    completed: '#1C7341',
    dropped: '#B3261E',
  },
};

/**
 * Over cover art, in both themes (art is a picture, not a surface): clear at
 * the top, dark where text sits. Text must start at or below `textStop`'s
 * location; the contrast test proves white text reads there even on a white cover.
 */
export const gradients = {
  overImage: {
    colors: ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.62)', 'rgba(0, 0, 0, 0.86)'],
    locations: [0.3, 0.6, 1],
    textStop: 'rgba(0, 0, 0, 0.62)',
  },
} as const;

/** expo-blur settings for frosted chrome, per theme. */
export const frosted: Record<ColorScheme, { tint: ColorScheme; intensity: number }> = {
  dark: { tint: 'dark', intensity: 40 },
  light: { tint: 'light', intensity: 50 },
};
