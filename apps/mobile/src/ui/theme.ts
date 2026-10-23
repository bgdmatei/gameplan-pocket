import type { EntryStatus } from '@gameplan/domain';
import { Platform } from 'react-native';
import type { TextStyle } from 'react-native';
import { frosted, palettes, statusPalettes } from './palette';
import type { ColorScheme, Colors } from './palette';

export type { ColorScheme, Colors } from './palette';
export { gradients } from './palette';

/**
 * Design tokens for the visual-design direction (SPEC-visual-design.md,
 * 2026-10-23, replacing "Arcade Night"): image-led cards over dark gradients,
 * Fraunces for headlines, the system font for everything else, soft large
 * radii, one warm gold accent. Colours live in `palette.ts` (pure, so the
 * contrast test can read them); sizes, type and motion live here. Screens use
 * these tokens only: `literals.test.ts` fails on a colour or font name anywhere else.
 */

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
  /** Cover art in grids and rows. */
  cover: 14,
  /** Inputs and small controls. */
  small: 14,
  /** Cards, notes and image cards. */
  card: 24,
  /** Sheets and the floating tab bar. */
  sheet: 28,
  /** Pill buttons, chips and badges. */
  pill: 999,
} as const;

/**
 * Fraunces (72pt Soft cut), embedded at build time by the expo-font plugin
 * (app.json), so it is there on the first frame. Named by PostScript name, which
 * iOS and Android both accept here. Never set a `fontWeight` with these: the
 * weight is the file, and iOS falls back to the system font on a mismatch.
 */
export const fonts = {
  serif: 'Fraunces72ptSoft-SemiBold',
  serifRegular: 'Fraunces72ptSoft-Regular',
} as const;

/**
 * Fraunces for headlines (`display*`), the system font (SF Pro on iOS, Roboto
 * on Android) for everything else. System sizes follow iOS's text styles.
 */
export const type = {
  /** Screen titles ("Library") and a hero's game name. */
  display: { fontFamily: fonts.serif, fontSize: 34, lineHeight: 40, letterSpacing: -0.3 },
  /** An image card's title; section titles. */
  displaySmall: { fontFamily: fonts.serif, fontSize: 24, lineHeight: 29 },
  largeTitle: { fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.5 },
  title: { fontSize: 20, lineHeight: 25, fontWeight: '700' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  callout: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  subhead: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  /** Uppercase labels above titles ("NOW PLAYING"), note types, section eyebrows. */
  label: { fontSize: 11, lineHeight: 13, fontWeight: '700', letterSpacing: 1.2 },
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
  /** expo-blur settings for frosted chrome (`ui/components/frosted.tsx`). */
  frosted: { tint: ColorScheme; intensity: number };
};

export const themes: Record<ColorScheme, Theme> = {
  light: {
    scheme: 'light',
    colors: palettes.light,
    status: statusPalettes.light,
    frosted: frosted.light,
  },
  dark: {
    scheme: 'dark',
    colors: palettes.dark,
    status: statusPalettes.dark,
    frosted: frosted.dark,
  },
};
