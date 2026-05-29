import type { Config } from 'tailwindcss';
import { tailwindTheme } from '@onyxhawk/ui-tokens/tailwind';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: tailwindTheme,
  },
  plugins: [],
};

export default config;
