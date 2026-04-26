import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { ensureCoachAndLogin } from './helpers/coach-session';

test.describe('Coach direct invite', () => {
  test('invites an athlete via /coach/athletes/invite', async ({ context, baseURL }) => {
    await ensureCoachAndLogin(context, baseURL!);

    const page = await context.newPage();
    const athleteEmail = `athlete+${Date.now()}@example.com`;

    await page.goto('/coach/athletes/invite');
    await page.getByLabel('Name').fill('E2E Athlete');
    await page.getByLabel('Email').fill(athleteEmail);
    await page.getByRole('button', { name: /Send invite/i }).click();

    await expect(page).toHaveURL(/\/coach\/athletes$/);
    await expect(page.getByText(athleteEmail)).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Invited' })).toBeVisible();

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data, error } = await admin
      .from('athletes')
      .select('email, status')
      .eq('email', athleteEmail.toLowerCase())
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({ email: athleteEmail.toLowerCase(), status: 'invited' });
  });
});
