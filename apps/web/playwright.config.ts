import { defineConfig, devices } from '@playwright/test'

const serverUrl = 'http://127.0.0.1:3001'
const webUrl = 'http://127.0.0.1:5173'

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: webUrl,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'pnpm --filter @codetogether/server exec tsx src/index.ts',
      cwd: '../..',
      url: `${serverUrl}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @codetogether/web exec vite --host 127.0.0.1 --port 5173',
      cwd: '../..',
      url: webUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
