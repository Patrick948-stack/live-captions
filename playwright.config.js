const { defineConfig, devices } = require('@playwright/test');
const fs = require('fs');

// Use an explicit executable path only when the binary actually exists there
// (i.e. the Claude Code remote environment). In GitHub Actions CI, Playwright
// installs its own Chromium via 'npx playwright install chromium' and must
// discover it through its own channel — not a hardcoded path.
const CHROMIUM_CANDIDATE = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/opt/pw-browsers/chromium';
const chromiumExecutablePath = fs.existsSync(CHROMIUM_CANDIDATE) ? CHROMIUM_CANDIDATE : undefined;

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          ...(chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {}),
        },
      },
    },
  ],
  webServer: {
    command: 'npx serve . -p 3000 --no-clipboard',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
