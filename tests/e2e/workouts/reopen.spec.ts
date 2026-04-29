import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  seedAthleteUser,
  signInAsAthlete,
  seedAssignedProgramForAthlete,
} from '../helpers/athlete-session';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';

function adminClient() {
  return createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test('athlete can reopen a completed workout', async ({ context }) => {
  const ts = Date.now();
  const email = `ath-reopen-${ts}@e2e.local`;
  const { coachId, athleteId } = await seedAthleteUser(email);
  const { dayId } = await seedAssignedProgramForAthlete(coachId, athleteId, `Reopen ${ts}`);

  // Service-role-seed a completed log.
  const admin = adminClient();
  await admin.from('workout_logs').insert({
    athlete_id: athleteId, program_day_id: dayId, status: 'completed',
    completed_at: new Date().toISOString(),
  });

  const page = await signInAsAthlete(context, email);
  await page.goto(`/app/workout/${dayId}`);
  await expect(page.getByText(/Completed/i).first()).toBeVisible();

  // Click Reopen.
  await page.getByRole('button', { name: /^Reopen$/i }).click();
  // After reopen, the Mark complete button should reappear.
  await expect(page.getByRole('button', { name: /Mark complete/i })).toBeVisible({ timeout: 5000 });
});
