import { test, expect } from '@playwright/test';
import { ensureCoachAndLogin } from '../helpers/coach-session';

test('coach sees the new alert sections on /coach', async ({ context }) => {
  await ensureCoachAndLogin(context);
  const page = await context.newPage();
  await page.goto('/coach');
  await expect(page.getByRole('heading', { name: /Missed workouts/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Pain reports/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Low readiness/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Recent activity/i })).toBeVisible();
});
