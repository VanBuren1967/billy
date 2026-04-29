import { test, expect } from '@playwright/test';
import { seedAthleteUser, signInAsAthlete } from '../helpers/athlete-session';

test('athlete can edit the current week\'s check-in', async ({ context }) => {
  const ts = Date.now();
  const email = `ath-edit-${ts}@e2e.local`;
  await seedAthleteUser(email);

  const page = await signInAsAthlete(context, email);
  await page.goto('/app/check-in');
  await page.getByLabel(/Bodyweight/i).fill('199.5');
  await page.getByRole('button', { name: /Submit check-in/i }).click();
  await expect(page.getByText(/✓ Saved/i)).toBeVisible({ timeout: 5000 });

  // Reload — bodyweight should be pre-filled, button morphs to "Update check-in".
  await page.reload();
  await expect(page.getByLabel(/Bodyweight/i)).toHaveValue('199.5');
  await expect(page.getByRole('button', { name: /Update check-in/i })).toBeVisible();

  // Edit + re-save.
  await page.getByLabel(/Bodyweight/i).fill('200');
  await page.getByRole('button', { name: /Update check-in/i }).click();
  await expect(page.getByText(/✓ Saved/i)).toBeVisible({ timeout: 5000 });
});
