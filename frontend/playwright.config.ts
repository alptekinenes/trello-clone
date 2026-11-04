import { defineConfig, devices } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    locale: 'tr-TR',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // The backend uses the dev database from backend/.env (migrations applied).
  webServer: [
    {
      command: 'npm run start -w backend',
      cwd: '..',
      url: 'http://localhost:3000/api/v1/health',
      // Many sign-ups, invitations and requests per run; the production limits (10/min,
      // 30/min and 300/min) would block repeated runs.
      env: {
        AUTH_RATE_LIMIT_PER_MINUTE: '1000',
        INVITATION_RATE_LIMIT_PER_MINUTE: '1000',
        API_RATE_LIMIT_PER_MINUTE: '1000',
      },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev',
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
