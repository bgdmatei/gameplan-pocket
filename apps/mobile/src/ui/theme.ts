import type { EntryStatus } from '@gameplan/domain';
import { Platform } from 'react-native';
import type { TextStyle } from 'react-native';

/**
 * Design tokens for "Arcade Night" (approved 2026-09-30, replacing "Save
 * Point"): an OLED-black ground where the covers carry the colour, one cyan
 * accent for what is selected and what is still open, and monospaced numbers
 * for playtime, progress and counts. Dark is the primary theme; light is the
 * same system on a pale ground. Screens use these tokens only, never literal
 * colours or sizes.
 *
 * Contrast (WCAG 2.x, AA is 4.5:1 for text), checked per pair:
 *
 * | Pair                            | Light | Dark |
 * | ------------------------------- | ----- | ---- |
 * | text on background              | 17.7  | 19.5 |
 * | muted on background             | 5.8   | 7.0  |
 * | muted on surface                | 6.3   | 6.1  |
 * | muted on raised                 | 5.4   | 5.5  |
 * | accent on background            | 4.8   | 13.4 |
 * | accent on surface               | 5.2   | 11.8 |
 * | onAccent on accentFill (button) | 5.2   | 10.6 |
 * | noteLabel on noteFill           | 5.6   | 10.8 |
 * | muted on noteFill               | 5.6   | 5.6  |
 * | danger on surface               | 6.5   | 7.3  |
 * | every status colour on surface  | ≥ 5.4 | ≥ 8.1 |
 * | every status colour on ground   | ≥ 4.9 | ≥ 9.2 |
 * | every status colour on raised   | ≥ 4.5 | ≥ 7.3 |
 */

export type ColorScheme = 'light' | 'dark';

export type Colors = {
  /** The screen's ground. */
  background: string;
  /** Cards, sheets, chips at rest. */
  surface: string;
  /** One step above `surface`: inputs inside a card, a pressed row. */
  raised: string;
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
  background: '#F3F6F9',
  surface: '#FFFFFF',
  raised: '#E8EDF2',
  text: '#0B0F14',
  muted: '#56616E',
  line: '#D5DCE4',
  accent: '#007A70',
  accentFill: '#007A70',
  onAccent: '#FFFFFF',
  noteFill: '#E0F5F2',
  noteLabel: '#006B62',
  danger: '#B3261E',
};

/** Pure black on purpose: OLED pixels switch off, and covers glow against it. */
const dark: Colors = {
  background: '#000000',
  surface: '#111418',
  raised: '#1A1F25',
  text: '#F4F7FA',
  muted: '#8A96A3',
  line: '#262D36',
  accent: '#2EE6D6',
  accentFill: '#2EE6D6',
  onAccent: '#032320',
  noteFill: '#08201E',
  noteLabel: '#2EE6D6',
  danger: '#FF7A70',
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
  /** Cover art: rounded like a cartridge label, still a shelf at 5,000. */
  cover: 10,
  /** Inputs, buttons and small controls. */
  small: 10,
  /** Cards, notes and sheets. */
  card: 16,
  /** Chips and badges. */
  pill: 999,
} as const;

/**
 * The system font (SF Pro on iOS, Roboto on Android) for text: no font to bundle, and
 * it follows the user's text-size setting. Sizes follow iOS's text styles.
 */
export const type = {
  largeTitle: { fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.5 },
  title: { fontSize: 20, lineHeight: 25, fontWeight: '700' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  callout: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  subhead: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  /** Uppercase labels: note types, section eyebrows. */
  label: { fontSize: 11, lineHeight: 13, fontWeight: '700', letterSpacing: 0.6 },
} as const satisfies Record<string, TextStyle>;

/**
 * Numbers in the system monospace (SF Mono, Roboto Mono's fallback on
 * Android): playtime, progress, counts and dates line up and read as a readout.
 */
export const tabularNumbers: TextStyle = {
  fontFamily: Platform.select({ ios: 'ui-monospace', default: 'monospace' }),
  fontVariant: ['tabular-nums'],
};

/**
 * Press feedback: a tappable sinks a little under the finger and springs back.
 * Collapsed to nothing when the phone asks for reduced motion.
 */
export const press = {
  scale: 0.96,
  spring: { damping: 18, stiffness: 420, mass: 0.6 },
} as const;

/** A status dot, wherever a status is shown with its label. */
export const statusDot = 8;

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
