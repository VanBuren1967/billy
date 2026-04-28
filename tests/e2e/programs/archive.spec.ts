import { test, expect } from '@playwright/test';
import { ensureCoachAndLogin } from '../helpers/coach-session';
import { getE2eCoachId, seedProgram } from '../helpers/programs-seed';

test('archive hides a program; restore brings it back', async ({ context }) => {
  await ensureCoachAndLogin(context);
  const coachId = await getE2eCoachId();
  const name = `Arch-test-${Date.now()}`;
  const { programId } = await seedProgram(coachId, { name, isTemplate: false });

  const page = await context.newPage();
  await page.goto(`/coach/programs/${programId}/edit`);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /archive program/i }).click();

  // Should redirect to /coach/programs (default tab) where archived is hidden.
  await expect(page).toHaveURL(/\/coach\/programs/);
  await expect(page.getByText(name)).toHaveCount(0);

  // Show archived.
  await page.goto('/coach/programs?archived=1');
  await expect(page.getByText(name)).toBeVisible();

  // Restore.
  await page.locator(`li:has-text("${name}") form button`).click();
  // Restore route redirects to /coach/programs?archived=1 with 303.
  await page.goto('/coach/programs');
  await expect(page.getByText(name)).toBeVisible();
});
