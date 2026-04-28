import { test, expect } from '@playwright/test';
import { seedAthleteUser, signInAsAthlete, seedAssignedProgramForAthlete } from '../helpers/athlete-session';

test('athlete navigates to /app/program and sees the tree', async ({ context }) => {
  const ts = Date.now();
  const email = `athlete-view-${ts}@e2e.local`;
  const { coachId, athleteId } = await seedAthleteUser(email);
  await seedAssignedProgramForAthlete(coachId, athleteId, `View ${ts}`);

  const page = await signInAsAthlete(context, email);
  await page.goto('/app/program');
  await expect(page.getByRole('cell', { name: 'Squat', exact: true })).toBeVisible();
});
