import { test, expect } from '@playwright/test';

test('unauthenticated user hitting /coach is redirected to /login', async ({ page }) => {
  await page.goto('/coach');
  await expect(page).toHaveURL(/\/login$/);
});

test('unauthenticated user hitting /app is redirected to /login', async ({ page }) => {
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login$/);
});

test('public pages render without auth', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /standard of/i })).toBeVisible();
});
