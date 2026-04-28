import { test, expect } from '@playwright/test';
import { ensureCoachAndLogin } from '../helpers/coach-session';
import {
  getE2eCoachId, seedTemplate, seedAthlete, assignTemplate,
} from '../helpers/programs-seed';

test('editing an assigned copy does not modify the template', async ({ context }) => {
  await ensureCoachAndLogin(context);
  const coachId = await getE2eCoachId();
  const { templateId } = await seedTemplate(coachId, `Tpl-iso-${Date.now()}`);
  const { athleteId } = await seedAthlete(coachId);
  const { newProgramId } = await assignTemplate(coachId, templateId, athleteId);

  const page = await context.newPage();
  // Edit the assigned copy.
  await page.goto(`/coach/programs/${newProgramId}/edit`);
  // The exercise name input starts with value="Squat". After fill() its value
  // changes, so we focus + clear + type rather than re-resolving the locator.
  const squatInput = page.locator('input[value="Squat"]').first();
  await squatInput.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Pause Squat (assigned edit)');
  await page.keyboard.press('Tab');
  // Wait for the autosave to settle.
  await page.waitForTimeout(500);

  // Now visit the template — Squat should still be present.
  await page.goto(`/coach/programs/${templateId}/edit`);
  await expect(page.locator('input[value="Squat"]').first()).toBeVisible();
});
