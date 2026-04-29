import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { ensureCoachAndLogin } from '../helpers/coach-session';
import {
  seedAthleteUser,
  seedAssignedProgramForAthlete,
} from '../helpers/athlete-session';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';

function adminClient() {
  return createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test('coach sees a completed workout on the athlete detail page', async ({ context }) => {
  const ts = Date.now();
  const email = `ath-csl-${ts}@e2e.local`;
  const { coachId, athleteId } = await seedAthleteUser(email);
  const { dayId, exerciseId } = await seedAssignedProgramForAthlete(coachId, athleteId, `CSL ${ts}`);

  // Service-role-seed a completed workout_log + 1 set_log.
  const admin = adminClient();
  const { data: wl } = await admin.from('workout_logs').insert({
    athlete_id: athleteId, program_day_id: dayId, status: 'completed',
    completed_at: new Date().toISOString(), general_notes: 'Felt strong on the second set',
  }).select('id').single();
  await admin.from('set_logs').insert({
    workout_log_id: wl!.id, program_exercise_id: exerciseId, set_number: 1,
    weight_lbs: 225, reps_done: 5, rpe: 7, completed: true,
  });

  // Sign in as coach and verify.
  await ensureCoachAndLogin(context);
  const page = (await context.pages())[0] ?? await context.newPage();
  await page.goto(`/coach/athletes/${athleteId}`);
  await expect(page.getByText(/Recent workouts/i)).toBeVisible();
  await expect(page.getByText('Squat day')).toBeVisible();
  await expect(page.getByText(/Felt strong/i)).toBeVisible();
  await expect(page.getByText(/Done/i).first()).toBeVisible();
});
