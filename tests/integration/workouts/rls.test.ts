import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const admin = createClient(URL, SR, { auth: { persistSession: false } });

async function makeUserClient(email: string) {
  const { data: created } = await admin.auth.admin.createUser({ email, email_confirm: true });
  await admin.auth.admin.updateUserById(created.user!.id, { password: 'TestPass123!' });
  const c = createClient(URL, ANON, {
    auth: { persistSession: false, storageKey: `sb-test-${created.user!.id}` },
  });
  await c.auth.signInWithPassword({ email, password: 'TestPass123!' });
  return { client: c, userId: created.user!.id };
}

describe('RLS — workout_logs and set_logs', () => {
  let athleteAClient: SupabaseClient;
  let athleteBClient: SupabaseClient;
  let coachAClient: SupabaseClient;
  let coachBClient: SupabaseClient;
  let logAId: string;
  let setLogAId: string;

  beforeAll(async () => {
    const ts = Date.now();
    const cA = await makeUserClient(`coach-wl-A-${ts}@test.local`);
    const cB = await makeUserClient(`coach-wl-B-${ts}@test.local`);
    const aA = await makeUserClient(`ath-wl-A-${ts}@test.local`);
    const aB = await makeUserClient(`ath-wl-B-${ts}@test.local`);
    coachAClient = cA.client;
    coachBClient = cB.client;
    athleteAClient = aA.client;
    athleteBClient = aB.client;

    const cArow = await admin.from('coaches').insert({
      auth_user_id: cA.userId, display_name: 'A', email: `coach-wl-A-${ts}@test.local`,
    }).select('id').single();
    const cBrow = await admin.from('coaches').insert({
      auth_user_id: cB.userId, display_name: 'B', email: `coach-wl-B-${ts}@test.local`,
    }).select('id').single();
    const aArow = await admin.from('athletes').insert({
      coach_id: cArow.data!.id, auth_user_id: aA.userId,
      name: 'A', email: `ath-wl-A-${ts}@test.local`, is_active: true,
    }).select('id').single();
    await admin.from('athletes').insert({
      coach_id: cBrow.data!.id, auth_user_id: aB.userId,
      name: 'B', email: `ath-wl-B-${ts}@test.local`, is_active: true,
    });

    const pA = await admin.from('programs').insert({
      coach_id: cArow.data!.id, athlete_id: aArow.data!.id, name: 'A',
      block_type: 'general', total_weeks: 1, is_template: false,
    }).select('id').single();
    const dA = await admin.from('program_days').insert({
      program_id: pA.data!.id, week_number: 1, day_number: 1, name: 'Squat',
    }).select('id').single();
    const eA = await admin.from('program_exercises').insert({
      program_day_id: dA.data!.id, position: 1, name: 'Squat', sets: 3, reps: '5',
    }).select('id').single();

    const wA = await admin.from('workout_logs').insert({
      athlete_id: aArow.data!.id, program_day_id: dA.data!.id, status: 'in_progress',
    }).select('id').single();
    logAId = wA.data!.id;

    const sA = await admin.from('set_logs').insert({
      workout_log_id: logAId, program_exercise_id: eA.data!.id, set_number: 1,
      weight_lbs: 225, reps_done: 5,
    }).select('id').single();
    setLogAId = sA.data!.id;
  });

  it('athlete A can SELECT their own workout_log', async () => {
    const { data } = await athleteAClient.from('workout_logs').select('id').eq('id', logAId);
    expect(data?.length).toBe(1);
  });

  it('athlete B cannot SELECT athlete A\'s workout_log', async () => {
    const { data } = await athleteBClient.from('workout_logs').select('id').eq('id', logAId);
    expect(data).toEqual([]);
  });

  it('athlete A can UPDATE their own workout_log', async () => {
    const { data } = await athleteAClient.from('workout_logs')
      .update({ general_notes: 'felt good' }).eq('id', logAId).select();
    expect(data?.length).toBe(1);
  });

  it('athlete B cannot UPDATE athlete A\'s workout_log', async () => {
    const { data } = await athleteBClient.from('workout_logs')
      .update({ general_notes: 'hijacked' }).eq('id', logAId).select();
    expect(data ?? []).toEqual([]);
  });

  it('coach A can SELECT athlete A\'s workout_log', async () => {
    const { data } = await coachAClient.from('workout_logs').select('id').eq('id', logAId);
    expect(data?.length).toBe(1);
  });

  it('coach B cannot SELECT athlete A\'s workout_log', async () => {
    const { data } = await coachBClient.from('workout_logs').select('id').eq('id', logAId);
    expect(data).toEqual([]);
  });

  it('coach A cannot UPDATE athlete A\'s workout_log', async () => {
    const { data } = await coachAClient.from('workout_logs')
      .update({ general_notes: 'coach wrote' }).eq('id', logAId).select();
    expect(data ?? []).toEqual([]);
  });

  it('athlete A can SELECT their own set_log', async () => {
    const { data } = await athleteAClient.from('set_logs').select('id').eq('id', setLogAId);
    expect(data?.length).toBe(1);
  });

  it('athlete B cannot SELECT athlete A\'s set_log', async () => {
    const { data } = await athleteBClient.from('set_logs').select('id').eq('id', setLogAId);
    expect(data).toEqual([]);
  });

  it('coach A can SELECT athlete A\'s set_log', async () => {
    const { data } = await coachAClient.from('set_logs').select('id').eq('id', setLogAId);
    expect(data?.length).toBe(1);
  });
});
