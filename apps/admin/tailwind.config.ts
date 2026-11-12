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
};

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      ...freshTailwindTheme,
      colors,
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
