import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    setupFiles: ['reflect-metadata'],
    include: ['test/**/*.e2e-spec.ts'],
    // Test files share one database, so they run one at a time.
    fileParallelism: false,
    // Fixed env so e2e tests do not depend on a local .env file.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://trello:trello@localhost:5432/trello_test?schema=public',
      CORS_ORIGIN: 'http://localhost:5173',
      JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-characters-long',
      JWT_ACCESS_TTL_SECONDS: '900',
      REFRESH_TOKEN_TTL_DAYS: '7',
    },
  },
});
