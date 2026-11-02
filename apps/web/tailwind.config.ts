import type { Config } from 'tailwindcss';
import { freshTailwindTheme } from '@onyxhawk/ui-tokens/tailwind';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      ...freshTailwindTheme,
      fontFamily: {
        // Mockups pair a serif for headlines with a sans for body. Only list a
        // var() here once something defines it: an undefined var() voids the
        // whole stack and the browser drops to Times New Roman.
        serif: ['Georgia', 'Cambria', 'serif'],
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
