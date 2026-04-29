import { test, expect } from '@playwright/test';
import {
  seedAthleteUser,
  signInAsAthlete,
  seedAssignedProgramForAthlete,
} from '../helpers/athlete-session';

test('athlete logs a workout end-to-end and sees Completed status', async ({ context }) => {
  const ts = Date.now();
  const email = `ath-log-${ts}@e2e.local`;
  const { coachId, athleteId } = await seedAthleteUser(email);
  const { dayId } = await seedAssignedProgramForAthlete(coachId, athleteId, `Log ${ts}`);

  const page = await signInAsAthlete(context, email);

  // Navigate directly to the logger.
  await page.goto(`/app/workout/${dayId}`);
  await expect(page.getByRole('heading', { name: 'Squat day' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Squat', exact: true })).toBeVisible();

  // Fill in set 1: weight=225, reps=5, RPE=7
  const weightInputs = page.locator('input[placeholder="lb"]');
  await weightInputs.first().fill('225');
  await weightInputs.first().blur();
  // Wait for autosave to settle.
  await page.waitForTimeout(500);

  // Reps input is type=number with max=200 (next to the weight input).
  const repsInputs = page.locator('input[type="number"][max="200"]');
  await repsInputs.first().fill('5');
  await repsInputs.first().blur();
  await page.waitForTimeout(500);

  // Toggle "Done" on set 1.
  await page.getByRole('button', { name: /Mark set 1 done/i }).click();
  await page.waitForTimeout(500);

  // Mark workout complete.
  await page.getByRole('button', { name: /Mark complete/i }).click();
  await expect(page.getByText(/Workout complete/i)).toBeVisible({ timeout: 5000 });

  // Navigate back to /app — the "This week" list should show a Completed badge
  // for the seeded day (regardless of whether it happens to be "today").
  await page.goto('/app');
  await expect(page.getByLabel('Completed').first()).toBeVisible();
});
