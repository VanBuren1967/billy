import { test, expect } from '@playwright/test';
import { seedAthleteUser, signInAsAthlete } from '../helpers/athlete-session';

test('athlete with no assigned program sees the empty state', async ({ context }) => {
  const ts = Date.now();
  const email = `athlete-empty-${ts}@e2e.local`;
  await seedAthleteUser(email);
  // No program assigned.

  const page = await signInAsAthlete(context, email);
  await expect(page.getByText(/no program assigned yet/i)).toBeVisible();
});
