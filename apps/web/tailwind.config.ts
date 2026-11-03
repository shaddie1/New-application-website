import type { Config } from 'tailwindcss';
import { freshTailwindTheme } from '@onyxhawk/ui-tokens/tailwind';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: freshTailwindTheme,
  },
  plugins: [],
};

export default config;
