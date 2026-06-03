import type { Config } from 'tailwindcss';
import { tailwindTheme } from '@onyxhawk/ui-tokens/tailwind';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      ...tailwindTheme,
      fontFamily: {
        // Mockups pair a serif for headlines with a sans for body.
        serif: ['var(--font-serif)', 'Georgia', 'Cambria', 'serif'],
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
