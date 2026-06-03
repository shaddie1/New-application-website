import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // env.ts validates process.env at import time (and process.exit(1) on failure),
    // so any module that transitively imports it needs a valid env first.
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.{test,spec}.ts'],
  },
});
