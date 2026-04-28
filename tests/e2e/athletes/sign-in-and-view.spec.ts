import { test, expect } from '@playwright/test';
import { seedAthleteUser, signInAsAthlete, seedAssignedProgramForAthlete } from '../helpers/athlete-session';

test('athlete signs in and sees their assigned program', async ({ context }) => {
  const ts = Date.now();
  const email = `athlete-signin-${ts}@e2e.local`;
  const { coachId, athleteId } = await seedAthleteUser(email);
  await seedAssignedProgramForAthlete(coachId, athleteId, `E2E Program ${ts}`);

  const page = await signInAsAthlete(context, email);
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText(`E2E Program ${ts}`)).toBeVisible();
  await expect(page.getByText('Squat day')).toBeVisible();
});
