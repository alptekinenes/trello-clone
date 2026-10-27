import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    setupFiles: ['reflect-metadata'],
    include: ['src/**/*.spec.ts'],
  },
});
