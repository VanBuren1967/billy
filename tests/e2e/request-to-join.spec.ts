import { test, expect } from '@playwright/test';

const fixture = {
  name: 'Test Prospect',
  email: `prospect+${Date.now()}@example.com`,
  message: 'I have been training for 5 years and want to compete.',
};

test('prospect submits a join request', async ({ page, request }) => {
  await page.goto('/request-to-join');

  await expect(page.locator('h1')).toContainText(/Inquire about/i);

  await page.getByLabel('Name').fill(fixture.name);
  await page.getByLabel('Email').fill(fixture.email);
  await page.getByLabel(/Message/).fill(fixture.message);

  await page.getByRole('button', { name: /Submit inquiry/i }).click();

  await expect(page).toHaveURL(/\/request-to-join\/thanks$/);
  await expect(page.locator('h1')).toContainText(/Inquiry/i);

  // Verify via Supabase REST that the row exists.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await request.get(
    `${supabaseUrl}/rest/v1/join_requests?email=eq.${encodeURIComponent(fixture.email)}&select=name,email,status`,
    { headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` } },
  );
  expect(res.ok()).toBe(true);
  const rows = (await res.json()) as Array<{ name: string; email: string; status: string }>;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    name: fixture.name,
    email: fixture.email,
    status: 'pending',
  });
});

test('rejects invalid email', async ({ page }) => {
  await page.goto('/request-to-join');
  await page.getByLabel('Name').fill('Test User');
  await page.getByLabel('Email').fill('not-an-email');
  await page.getByRole('button', { name: /Submit inquiry/i }).click();
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(page).toHaveURL(/\/request-to-join$/);
});
