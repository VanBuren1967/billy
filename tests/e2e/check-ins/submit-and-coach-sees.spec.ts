import { test, expect } from '@playwright/test';
import { ensureCoachAndLogin } from '../helpers/coach-session';
import { seedAthleteUser, signInAsAthlete } from '../helpers/athlete-session';

test('athlete submits check-in, coach sees it on the athlete detail page', async ({ context }) => {
  const ts = Date.now();
  const email = `ath-ci-${ts}@e2e.local`;
  const { athleteId } = await seedAthleteUser(email);

  // Athlete fills + submits.
  const aPage = await signInAsAthlete(context, email);
  await aPage.goto('/app/check-in');
  await aPage.getByLabel(/Bodyweight/i).fill('200');
  // Sliders default to 5.
  await aPage.getByLabel(/Pain notes/i).fill('mild left knee tweak');
  await aPage.getByRole('button', { name: /Submit check-in/i }).click();
  await expect(aPage.getByText(/✓ Saved/i)).toBeVisible({ timeout: 5000 });

  // Coach signs in + verifies.
  await ensureCoachAndLogin(context);
  const cPage = await context.newPage();
  await cPage.goto(`/coach/athletes/${athleteId}`);
  await expect(cPage.getByText(/Recent check-ins/i)).toBeVisible();
  await expect(cPage.getByText(/200 lb/i)).toBeVisible();
  await expect(cPage.getByText(/mild left knee/i)).toBeVisible();
});
