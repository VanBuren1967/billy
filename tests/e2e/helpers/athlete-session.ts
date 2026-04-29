import { createClient } from '@supabase/supabase-js';
import { type BrowserContext, expect } from '@playwright/test';
import { clearInbucket, getMagicLinkFor } from './inbucket';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';

function adminClient() {
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, sk, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Ensure an athlete with the given email is created and linked to a coach.
 * Creates the auth user, the coach (if needed), and the athletes row with
 * auth_user_id linked. Returns IDs for subsequent seeding.
 */
export async function seedAthleteUser(
  athleteEmail: string,
  coachEmail = 'coach+e2e@example.com',
) {
  const admin = adminClient();

  // Coach (reuse the e2e coach)
  const { data: coachUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  let coachUser = coachUsers?.users.find((u) => u.email === coachEmail);
  if (!coachUser) {
    const { data } = await admin.auth.admin.createUser({ email: coachEmail, email_confirm: true });
    coachUser = data.user!;
  }
  let { data: coach } = await admin
    .from('coaches').select('id').eq('auth_user_id', coachUser.id).maybeSingle();
  if (!coach) {
    const { data } = await admin.from('coaches').insert({
      auth_user_id: coachUser.id, display_name: 'E2E Coach', email: coachEmail,
    }).select('id').single();
    coach = data!;
  }

  // Athlete user
  const { data: athleteUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  let athleteUser = athleteUsers?.users.find((u) => u.email === athleteEmail);
  if (!athleteUser) {
    const { data } = await admin.auth.admin.createUser({ email: athleteEmail, email_confirm: true });
    athleteUser = data.user!;
  }

  // Athletes row
  let { data: athleteRow } = await admin
    .from('athletes').select('id').eq('auth_user_id', athleteUser.id).maybeSingle();
  if (!athleteRow) {
    const { data } = await admin.from('athletes').insert({
      coach_id: coach!.id, auth_user_id: athleteUser.id,
      name: 'E2E Athlete', email: athleteEmail, is_active: true,
    }).select('id').single();
    athleteRow = data!;
  }

  return { coachId: coach!.id, athleteId: athleteRow!.id, athleteEmail };
}

/**
 * Sign in an athlete via the real /login form + Inbucket magic link.
 * Returns the same page with an authenticated athlete session at /app.
 */
export async function signInAsAthlete(context: BrowserContext, email: string) {
  await clearInbucket(email);
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByPlaceholder('you@email.com').fill(email);
  await page.getByRole('button', { name: /send link/i }).click();
  await expect(page.getByText(/link sent/i)).toBeVisible();

  const url = await getMagicLinkFor(email);
  await page.goto(url);
  await expect(page).toHaveURL(/\/app(\/.*)?$/);
  return page;
}

/**
 * Programmatic seed of an assigned program for the given athlete.
 * Returns ids for the program, the seeded day, and the seeded exercise so
 * tests can navigate directly to /app/workout/<dayId> without scraping.
 */
export async function seedAssignedProgramForAthlete(
  coachId: string, athleteId: string, name = 'E2E Assigned',
) {
  const admin = adminClient();
  const { data: prog } = await admin.from('programs').insert({
    coach_id: coachId, athlete_id: athleteId, name,
    block_type: 'general', total_weeks: 2, is_template: false,
  }).select('id').single();
  const programId = prog!.id;

  const { data: day } = await admin.from('program_days').insert({
    program_id: programId, week_number: 1, day_number: 1, name: 'Squat day',
  }).select('id').single();
  const dayId = day!.id;

  const { data: exercise } = await admin.from('program_exercises').insert({
    program_day_id: dayId, position: 1, name: 'Squat', sets: 5, reps: '5', load_pct: 75,
  }).select('id').single();
  const exerciseId = exercise!.id;

  return { programId, dayId, exerciseId };
}
