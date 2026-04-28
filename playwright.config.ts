import { defineConfig, devices } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Load .env.local into process.env so tests can read NEXT_PUBLIC_SUPABASE_URL etc.
// Next handles this for the dev server, but the Playwright runner is a separate process.
const envPath = join(__dirname, '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
  }
}

// Run on 3100 so e2e doesn't collide with other local Next dev servers on 3000.
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  // workers: 1 because all auth-using specs share coach+e2e@example.com via
  // Inbucket. Parallel runs collide on the mailbox + auth.admin.createUser.
  // Long-term fix: a global-setup fixture with reusable storageState.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `pnpm dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { NEXT_PUBLIC_SITE_URL: BASE_URL },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
