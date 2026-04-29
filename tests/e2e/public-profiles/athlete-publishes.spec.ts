import { test, expect } from '@playwright/test';
import { ensureCoachAndLogin } from '../helpers/coach-session';
import { seedAthleteUser, signInAsAthlete } from '../helpers/athlete-session';

test('athlete writes profile, coach approves, public /team renders it', async ({
  context,
  browser,
}) => {
  const ts = Date.now();
  const email = `pp-${ts}@e2e.local`;
  const headline = `Junior 198 — USAPL ${ts}`;
  const bio =
    'Powerlifter chasing a national qualifying total. Trains five days a week under William.';

  const { athleteId } = await seedAthleteUser(email);

  // 1. Athlete signs in and fills the public profile editor.
  const aPage = await signInAsAthlete(context, email);
  await aPage.goto('/app/profile/public');
  await aPage.getByLabel(/Headline/i).fill(headline);
  await aPage.getByLabel('Bio', { exact: true }).fill(bio);
  await aPage.getByRole('button', { name: /Save profile/i }).click();
  await expect(aPage.getByText(/✓ Saved/i)).toBeVisible({ timeout: 5000 });
  await aPage.reload();
  await expect(aPage.getByText(/Pending coach approval/i)).toBeVisible();
  const slugMatch = await aPage.getByText(/\/team\/[a-z0-9-]+/i).first().textContent();
  expect(slugMatch).toBeTruthy();
  const slug = slugMatch!.replace(/^.*\/team\//, '').trim();

  // 2. Coach signs in (replaces the athlete session in this context) and approves.
  await ensureCoachAndLogin(context);
  const cPage = await context.newPage();
  await cPage.goto(`/coach/athletes/${athleteId}`);
  await expect(cPage.getByRole('heading', { name: /Public profile/i })).toBeVisible();
  await expect(cPage.getByText(/Awaiting approval/i)).toBeVisible();
  await cPage.getByRole('button', { name: /Approve & publish/i }).click();
  await expect(cPage.getByText(/✓ Published/i)).toBeVisible({ timeout: 5000 });

  // 3. Anonymous browser context — /team list shows the published athlete.
  const anon = await browser.newContext();
  const tPage = await anon.newPage();
  await tPage.goto('/team');
  await expect(tPage.getByRole('heading', { name: /The Team/i })).toBeVisible();
  await expect(tPage.getByText(headline)).toBeVisible();

  // 4. Anonymous /team/[slug] shows the full bio.
  await tPage.goto(`/team/${slug}`);
  await expect(tPage.getByText(bio)).toBeVisible();
  await expect(tPage.getByRole('heading', { level: 1 })).toBeVisible();
  await anon.close();
});
