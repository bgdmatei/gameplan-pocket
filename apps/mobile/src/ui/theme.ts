import type { EntryStatus } from '@gameplan/domain';
import type { TextStyle } from 'react-native';

/**
 * Design tokens for direction A, "Save Point" (approved 2026-09-23): a
 * dark-first console library where the covers carry the colour, on a
 * blue-black ground, with one amber accent for what is selected and what is
 * still open. Screens use these tokens only, never literal colours or sizes.
 *
 * Contrast (WCAG 2.x, AA is 4.5:1 for text), checked per pair:
 *
 * | Pair                            | Light | Dark |
 * | ------------------------------- | ----- | ---- |
 * | text on background              | 16.5  | 16.3 |
 * | muted on background             | 5.7   | 7.4  |
 * | muted on surface                | 6.2   | 6.7  |
 * | accent on background            | 5.4   | 10.3 |
 * | accent on surface               | 5.9   | 9.3  |
 * | onAccent on accentFill (button) | 9.8   | 9.8  |
 * | noteLabel on noteFill           | 5.5   | 9.1  |
 * | muted on noteFill               | 5.8   | 6.5  |
 * | every status colour on surface  | ≥ 4.9 | ≥ 7.5 |
 * | every status colour on ground   | ≥ 4.5 | ≥ 8.3 |
 */

export type ColorScheme = 'light' | 'dark';

export type Colors = {
  /** The screen's ground. */
  background: string;
  /** Cards, sheets, chips at rest. */
  surface: string;
  text: string;
  /** Secondary text: captions, counts, locations. */
  muted: string;
  /** Hairlines, dividers, empty stars, chip borders. */
  line: string;
  /** Accent used as text or an icon: links, filled stars, selected labels. */
  accent: string;
  /** Accent used as a fill: the selected chip, the primary button, the open-note badge. */
  accentFill: string;
  /** Text and icons placed on `accentFill`. */
  onAccent: string;
  /** Behind a note that is still open. */
  noteFill: string;
  /** The type label on an open note ("Puzzle · open"). */
  noteLabel: string;
  /** Destructive actions (delete a note). Same hue as `dropped`. */
  danger: string;
};

const light: Colors = {
  background: '#F4F5F7',
  surface: '#FFFFFF',
  text: '#14171C',
  muted: '#5A616D',
  line: '#E2E5EA',
  accent: '#8A5A00',
  accentFill: '#F2B544',
  onAccent: '#14171C',
  noteFill: '#FFF6E0',
  noteLabel: '#8A5A00',
  danger: '#B3261E',
};

const dark: Colors = {
  background: '#0E1116',
  surface: '#181C23',
  text: '#ECEEF2',
  muted: '#9AA3B2',
  line: '#252B35',
  accent: '#F2B544',
  accentFill: '#F2B544',
  onAccent: '#14171C',
  noteFill: '#221E14',
  noteLabel: '#F2B544',
  danger: '#FF8A80',
};

/**
 * Status colours carry meaning, not brand, so they are shared by both themes'
 * logic and only shift in lightness. Always shown with the status label:
 * colour alone would fail anyone who can't tell them apart.
 */
const statusLight: Record<EntryStatus, string> = {
  wishlist: '#7A4FC0',
  backlog: '#56606E',
  playing: '#1B5FBF',
  paused: '#9A5B00',
  completed: '#1E7A45',
  dropped: '#B3261E',
};

const statusDark: Record<EntryStatus, string> = {
  wishlist: '#C4A6FF',
  backlog: '#AEB6C4',
  playing: '#7DB6FF',
  paused: '#F2B544',
  completed: '#6FD39A',
  dropped: '#FF8A80',
};

/** A 4-point scale. The grid gutter is `sm`; screen edges are `lg`. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  /** Cover art: a little rounding, so a grid of 5,000 still reads as a shelf. */
  cover: 8,
  /** Notes and small controls. */
  small: 10,
  /** Cards and sheets. */
  card: 14,
  /** Chips and badges. */
  pill: 999,
} as const;

/**
 * The system font (SF Pro on iOS, Roboto on Android): no font to bundle, and
 * it follows the user's text-size setting. Sizes follow iOS's text styles.
 */
export const type = {
  largeTitle: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4 },
  title: { fontSize: 20, lineHeight: 25, fontWeight: '700' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  callout: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  subhead: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  /** Uppercase labels: note types, section eyebrows. */
  label: { fontSize: 11, lineHeight: 13, fontWeight: '700', letterSpacing: 0.6 },
} as const satisfies Record<string, TextStyle>;

/** Digits that line up: playtime, counts, ratings. */
export const tabularNumbers: TextStyle = { fontVariant: ['tabular-nums'] };

/** The smallest touch target on either platform. */
export const minTouchTarget = 44;

export type Theme = {
  scheme: ColorScheme;
  colors: Colors;
  status: Record<EntryStatus, string>;
};

export const themes: Record<ColorScheme, Theme> = {
  light: { scheme: 'light', colors: light, status: statusLight },
  dark: { scheme: 'dark', colors: dark, status: statusDark },
};
