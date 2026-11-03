import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';
import { freshTailwindTheme } from '@onyxhawk/ui-tokens/tailwind';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: freshTailwindTheme,
  },
  // The enter and exit animations (`animate-in`, `fade-in-0`, …) the dialogs use.
  plugins: [animate],
};

export default config;
