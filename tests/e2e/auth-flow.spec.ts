import { test, expect } from '@playwright/test';
import { getMagicLinkFor, clearInbucket } from './helpers/inbucket';

test('magic-link flow lands on /login?error=account_not_yet_linked for unlinked user', async ({
  page,
}) => {
  const email = `e2e-unlinked-${Date.now()}@example.com`;
  await clearInbucket(email);

  await page.goto('/login');
  await page.getByPlaceholder('you@email.com').fill(email);
  await page.getByRole('button', { name: /send link/i }).click();
  await expect(page.getByText(/link sent/i)).toBeVisible();

  const link = await getMagicLinkFor(email);
  await page.goto(link);

  // Unlinked user — callback redirects to /login with the friendly error.
  await expect(page).toHaveURL(/\/login\?error=account_not_yet_linked/);
  await expect(page.getByText(/account.*set up/i)).toBeVisible();
});
