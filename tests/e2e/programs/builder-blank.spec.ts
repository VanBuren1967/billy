import { test, expect } from '@playwright/test';
import { ensureCoachAndLogin } from '../helpers/coach-session';

test('coach creates a blank program and adds week + day + exercise', async ({ context }) => {
  await ensureCoachAndLogin(context);
  const page = await context.newPage();

  await page.goto('/coach/programs/new');
  await page.getByText('Start blank').click();

  await page.getByLabel('Name').fill(`E2E Blank ${Date.now()}`);
  await page.getByLabel('Block type').selectOption('strength');
  await page.getByLabel('Total weeks').fill('4');
  await page.getByRole('button', { name: /create program/i }).click();

  await expect(page).toHaveURL(/\/coach\/programs\/.+\/edit/);
  await page.getByRole('button', { name: /\+ Add week/i }).click();
  // Expand the newly-added week so the "+ Add exercise" button is in the DOM.
  await page.getByRole('button', { name: /^Week 1/ }).click();
  await expect(page.getByText(/Week 1/)).toBeVisible();
  await page.getByRole('button', { name: /\+ Add exercise/i }).click();
  await expect(page.locator('input[value="New exercise"]').first()).toBeVisible();
});
