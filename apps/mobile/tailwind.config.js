const { tailwindTheme } = require('@onyxhawk/ui-tokens/tailwind');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: tailwindTheme,
  },
  plugins: [],
};
