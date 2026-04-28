import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(URL, SR, { auth: { persistSession: false } });

describe('workout_logs lifecycle (DB-level)', () => {
  let programDayId: string;
  let exerciseId: string;
  let athleteId: string;

  beforeAll(async () => {
    const ts = Date.now();
    const u1 = await admin.auth.admin.createUser({ email: `c-lf-${ts}@test.local`, email_confirm: true });
    const c = await admin.from('coaches').insert({
      auth_user_id: u1.data.user!.id, display_name: 'C', email: `c-lf-${ts}@test.local`,
    }).select('id').single();
    const u2 = await admin.auth.admin.createUser({ email: `a-lf-${ts}@test.local`, email_confirm: true });
    const a = await admin.from('athletes').insert({
      coach_id: c.data!.id, auth_user_id: u2.data.user!.id,
      name: 'A', email: `a-lf-${ts}@test.local`, is_active: true,
    }).select('id').single();
    athleteId = a.data!.id;

    const p = await admin.from('programs').insert({
      coach_id: c.data!.id, athlete_id: athleteId, name: 'P',
      block_type: 'general', total_weeks: 1, is_template: false,
    }).select('id').single();
    const d = await admin.from('program_days').insert({
      program_id: p.data!.id, week_number: 1, day_number: 1, name: 'Squat',
    }).select('id').single();
    programDayId = d.data!.id;
    const e = await admin.from('program_exercises').insert({
      program_day_id: programDayId, position: 1, name: 'Squat', sets: 3, reps: '5',
    }).select('id').single();
    exerciseId = e.data!.id;
  });

  it('UNIQUE (athlete_id, program_day_id) prevents duplicate workout_logs', async () => {
    const first = await admin.from('workout_logs').insert({
      athlete_id: athleteId, program_day_id: programDayId,
    }).select('id').single();
    expect(first.error).toBeNull();
    const second = await admin.from('workout_logs').insert({
      athlete_id: athleteId, program_day_id: programDayId,
    });
    expect(second.error).toBeTruthy();
  });

  it('UNIQUE (workout_log_id, program_exercise_id, set_number) prevents duplicate set_logs', async () => {
    const { data: log } = await admin.from('workout_logs').select('id').eq('athlete_id', athleteId).single();
    const first = await admin.from('set_logs').insert({
      workout_log_id: log!.id, program_exercise_id: exerciseId, set_number: 99,
    });
    expect(first.error).toBeNull();
    const second = await admin.from('set_logs').insert({
      workout_log_id: log!.id, program_exercise_id: exerciseId, set_number: 99,
    });
    expect(second.error).toBeTruthy();
  });

  it('updated_at trigger bumps on UPDATE', async () => {
    const { data: log } = await admin.from('workout_logs').select('id, updated_at').eq('athlete_id', athleteId).single();
    const initialUpdated = log!.updated_at;
    await new Promise((r) => setTimeout(r, 50));
    await admin.from('workout_logs').update({ general_notes: 'updated' }).eq('id', log!.id);
    const { data: after } = await admin.from('workout_logs').select('updated_at').eq('id', log!.id).single();
    expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(new Date(initialUpdated).getTime());
  });

  it('FK ON DELETE RESTRICT on program_day_id when log exists', async () => {
    const { error } = await admin.from('program_days').delete().eq('id', programDayId);
    expect(error).toBeTruthy();
  });
});
