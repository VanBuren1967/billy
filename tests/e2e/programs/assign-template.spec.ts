import { test, expect } from '@playwright/test';
import { ensureCoachAndLogin } from '../helpers/coach-session';
import { getE2eCoachId, seedTemplate, seedAthlete } from '../helpers/programs-seed';

test('coach assigns a template to an athlete', async ({ context }) => {
  await ensureCoachAndLogin(context);
  const coachId = await getE2eCoachId();
  const { templateId } = await seedTemplate(coachId, `Tpl-assign-${Date.now()}`);
  const { athleteId, athleteName } = await seedAthlete(coachId, `Athlete-${Date.now()}`);

  const page = await context.newPage();
  await page.goto(`/coach/programs/${templateId}/assign`);
  await page.getByLabel('Athlete').selectOption(athleteId);
  await page.getByRole('button', { name: /assign program/i }).click();

  await expect(page).toHaveURL(/\/coach\/programs\/.+\/edit/);
  // The assigned copy shows the athlete name as the badge; the template's
  // exercise (Squat) should be present in an <input value="Squat"/>.
  await expect(page.getByText(athleteName).first()).toBeVisible();
  await expect(page.locator('input[value="Squat"]').first()).toBeVisible();
});
