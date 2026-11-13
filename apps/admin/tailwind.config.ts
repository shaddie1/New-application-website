import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';
import { freshTailwindTheme } from '@onyxhawk/ui-tokens/tailwind';

/** A class colour that reads a token from `app/globals.css` and still takes an opacity (`bg-danger/10`). */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

/**
 * Every colour class the admin has. The values live in `app/globals.css`; this
 * only gives them class names. It replaces the shared theme's colours rather
 * than adding to them, so the website and the mobile app keep theirs and no
 * admin colour comes from `@onyxhawk/ui-tokens`.
 *
 * Several names point at one token because pages written at different times
 * use different names for the same thing (`text-charcoal` and `text-text`).
 */
const colors = {
  // Surfaces
  page: token('page'),
  surface: token('surface'),
  bg: token('surface'), // `bg-bg` is on inputs and dialog panels, which are white; the page is `bg-page`
  cream: token('surface'),
  'bg-muted': token('sunken'),
  mist: token('mist'),

  // Lines
  line: token('line'),
  border: token('border'),
  'border-strong': token('border-strong'),

  // Text
  ink: token('ink'),
  charcoal: token('ink'),
  text: token('ink'),
  'charcoal-muted': token('muted'),
  'text-muted': token('muted'),

  // Navy
  navy: token('navy'),
  'navy-soft': token('navy-soft'),
  'surface-dark': token('navy-deep'),
  'text-on-dark': token('on-dark'),
  'text-on-dark-muted': token('on-dark-muted'),

  // Teal. `aqua` is the fill, `aqua-deep` the text
  aqua: token('teal-fill'),
  'aqua-deep': token('teal'),
  'aqua-soft': token('teal-soft'),
  'aqua-light': token('teal-light'),

  // Meaning: good, needs attention, bad
  success: token('teal'),
  warning: token('amber'),
  amber: token('amber'),
  danger: token('red'),

  // Gold is decoration (fills, borders, icons); brass is the gold for text
  gold: token('gold'),
  brass: token('brass'),

  'service-office': token('steel'),

  // The Dashboard's sections, one hue each. `-tint` is a background, `-strong`
  // a fill or an accent, `-deep` the shade for text (`text-section-month-deep`)
  'section-attention-tint': token('section-attention-tint'),
  'section-attention-strong': token('section-attention-strong'),
  'section-attention-deep': token('section-attention-deep'),
  'section-month-tint': token('section-month-tint'),
  'section-month-strong': token('section-month-strong'),
  'section-month-deep': token('section-month-deep'),
  'section-trend-tint': token('section-trend-tint'),
  'section-trend-strong': token('section-trend-strong'),
  'section-trend-deep': token('section-trend-deep'),
  'section-breakdown-tint': token('section-breakdown-tint'),
  'section-breakdown-strong': token('section-breakdown-strong'),
  'section-breakdown-deep': token('section-breakdown-deep'),
  'section-ownership-tint': token('section-ownership-tint'),
  'section-ownership-strong': token('section-ownership-strong'),
  'section-ownership-deep': token('section-ownership-deep'),

  // Meaning in the white-led look: growth or good, a target or something
  // needing attention, overdue or a fall. The bare name is the text shade; a
  // badge is `bg-positive-tint text-positive`. Errors stay `danger`
  positive: token('positive'),
  'positive-tint': token('positive-tint'),
  'positive-strong': token('positive-strong'),
  attention: token('attention'),
  'attention-tint': token('attention-tint'),
  'attention-strong': token('attention-strong'),
  overdue: token('overdue'),
  'overdue-tint': token('overdue-tint'),
  'overdue-strong': token('overdue-strong'),
};

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      ...freshTailwindTheme,
      colors,
      // `shadow-card`: the one shadow a card has. Its value is in app/globals.css.
      boxShadow: { card: 'var(--shadow-card)' },
      // Declared here, not in the shared theme, so the website keeps its own
      // type. app/layout.tsx defines the two variables. Each carries a system
      // face as its own fallback: a variable that is not defined would
      // otherwise void the whole stack and the browser would drop to Times.
      fontFamily: {
        sans: ['var(--font-sans, ui-sans-serif)', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        serif: ['var(--font-serif, Georgia)', 'Georgia', 'Cambria', 'serif'],
      },
    },
  },
  // The enter and exit animations (`animate-in`, `fade-in-0`, …) the dialogs use.
  plugins: [animate],
};

export default config;
