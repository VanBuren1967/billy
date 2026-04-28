import { test, expect } from '@playwright/test';
import { ensureCoachAndLogin } from '../helpers/coach-session';
import { getE2eCoachId, seedTemplate } from '../helpers/programs-seed';

test('coach duplicates a template into a fresh assigned-shape program', async ({ context }) => {
  await ensureCoachAndLogin(context);
  const coachId = await getE2eCoachId();
  await seedTemplate(coachId, `Tpl-fromTpl-${Date.now()}`);

  const page = await context.newPage();
  await page.goto('/coach/programs/new');
  await page.getByText('From a template').click();
  await page.getByText(/Tpl-fromTpl-/).first().click();

  await expect(page).toHaveURL(/\/coach\/programs\/.+\/edit/);
  // The Squat exercise name lives in an <input value=""/>, not a text node.
  await expect(page.locator('input[value="Squat"]').first()).toBeVisible();
});
