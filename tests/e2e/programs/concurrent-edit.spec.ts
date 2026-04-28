import { test, expect } from '@playwright/test';
import { ensureCoachAndLogin } from '../helpers/coach-session';
import { getE2eCoachId, seedTemplate } from '../helpers/programs-seed';

test('two tabs editing the same program → second save shows conflict', async ({ context }) => {
  await ensureCoachAndLogin(context);
  const coachId = await getE2eCoachId();
  const { templateId } = await seedTemplate(coachId, `Tpl-conf-${Date.now()}`);

  // Tab A: edit + save (version goes from 1 → 2).
  const pageA = await context.newPage();
  await pageA.goto(`/coach/programs/${templateId}/edit`);
  const titleA = pageA.locator('input').first();
  await titleA.fill('Tpl-A-edit');
  await titleA.blur();
  await pageA.waitForTimeout(500);

  // Tab B: opens a fresh page (sees current state — but with version still equals 2 because A's save bumped it. To force a real conflict, we open Tab B BEFORE A saves). Realistic test: open both first, save in A, save in B, expect conflict in B.
  // Re-open A and B fresh, then race:
  const pageA2 = await context.newPage();
  await pageA2.goto(`/coach/programs/${templateId}/edit`);
  const pageB = await context.newPage();
  await pageB.goto(`/coach/programs/${templateId}/edit`);

  // Both have the same version. Save A first.
  const titleA2 = pageA2.locator('input').first();
  await titleA2.fill('A-second-edit');
  await titleA2.blur();
  await pageA2.waitForTimeout(500);

  // B saves with the now-stale version → conflict.
  const titleB = pageB.locator('input').first();
  await titleB.fill('B-conflict-edit');
  await titleB.blur();
  await expect(pageB.getByText(/edit conflict/i)).toBeVisible({ timeout: 5000 });
});
