/**
 * OnyxHawk design tokens.
 * Extracted by eye from the design mockups in /mockups. Refine once we have
 * the source design file (Figma export, etc.) — but these are close enough to
 * build against today.
 */

export const colors = {
  // Surface
  bg: '#F5F1E6',           // warm cream (Home, catalog, profile)
  bgMuted: '#EDE7D8',
  surface: '#FFFFFF',
  surfaceDark: '#1B1814',  // near-black card (next-clean, STK sheet, points card)

  // Brand
  gold: '#C9A55C',         // primary accent (buttons, dots, progress)
  goldDeep: '#A78445',
  goldSoft: '#E6CFA0',     // subtle gold backgrounds

  // Text
  text: '#1B1814',
  textMuted: '#5C544A',
  textOnDark: '#F5F1E6',
  textOnDarkMuted: '#B6AC9A',

  // Service-line color codes (calendar dots on screen 09)
  serviceResidential: '#4F7B5C',
  serviceOffice: '#3A5E7A',
  serviceHospital: '#A8556B',
  servicePostBuild: '#C97E3B',
  serviceFumigation: '#6B4E8C',

  // Status
  success: '#4F7B5C',
  warning: '#C97E3B',
  danger: '#B14747',

  // Border / lines
  border: '#E2DCC9',
  borderStrong: '#C7BFA8',

  // Dark surfaces, used for the footer and other grounding bands.
  ink: '#12100E',
  inkRaised: '#1B1814',
  inkSoft: '#241F1A',
  inkBorder: '#31291F',

  // Bright brand palette (company brand sheet): cream page, black structure,
  // hawk gold as the accent, bronze wherever gold would be too pale to read.
  cream: '#FDFAF2',        // page background
  creamDeep: '#F4F1E6',    // alternating bands, hovers
  neutralLight: '#F2F2F2',
  goldBright: '#D4A843',   // accent: fills, icons, key numbers
  bronze: '#A87D22',       // accent text and links on cream — gold alone is
                           // too low-contrast for small type on a light page
  charcoal: '#14120F',     // headings and body text
  charcoalMuted: '#5A5348', // secondary text
  line: '#E8E2D2',         // hairlines on cream
} as const;

export const radii = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,   // most card corners in the mockups
  pill: 999,
} as const;

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

// Mockups use a serif for headlines and a sans for body. We default to the
// closest free pairings (DM Serif Display + Inter); replace with the licensed
// fonts once we have them.
export const fonts = {
  serif: 'DMSerifDisplay',
  sans: 'Inter',
} as const;

export const fontSizes = {
  xs: 12,
  sm: 13,
  base: 15,
  lg: 17,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 38,  // big serif headlines
} as const;

export const lineHeights = {
  tight: 1.15,
  normal: 1.35,
  relaxed: 1.55,
} as const;

export type ColorToken = keyof typeof colors;
export type RadiusToken = keyof typeof radii;
export type SpacingToken = keyof typeof spacing;
