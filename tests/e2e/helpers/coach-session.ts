import { createClient } from '@supabase/supabase-js';
import { expect, type BrowserContext } from '@playwright/test';
import { clearInbucket, getMagicLinkFor } from './inbucket';

/**
 * Ensures a coach with email `coach+e2e@example.com` exists, then logs in via
 * the real /login form so we get a valid PKCE session (admin.generateLink
 * produces implicit-flow tokens that our /auth/callback route doesn't accept).
 */
export async function ensureCoachAndLogin(context: BrowserContext) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = `coach+e2e@example.com`;

  const { data: usersList } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  let user = usersList?.users.find((u) => u.email === email);
  if (!user) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (error || !created.user) throw new Error(`createUser failed: ${error?.message}`);
    user = created.user;
  }

  const { data: coachRow } = await admin
    .from('coaches')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!coachRow) {
    const { error } = await admin.from('coaches').insert({
      auth_user_id: user.id,
      display_name: 'E2E Coach',
      email,
    });
    if (error) throw new Error(`coach insert failed: ${error.message}`);
  }

  await clearInbucket(email);

  const page = await context.newPage();
  await page.goto('/login');
  await page.getByPlaceholder('you@email.com').fill(email);
  await page.getByRole('button', { name: /send link/i }).click();
  await expect(page.getByText(/link sent/i)).toBeVisible();

  const magicLink = await getMagicLinkFor(email);
  await page.goto(magicLink);
  await page.waitForURL(/\/coach/);
  await page.close();
}
