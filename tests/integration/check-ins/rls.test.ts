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

describe('RLS — check_ins', () => {
  let athleteAClient: SupabaseClient;
  let athleteBClient: SupabaseClient;
  let coachAClient: SupabaseClient;
  let coachBClient: SupabaseClient;
  let checkInAId: string;
  let athleteAId: string;

  beforeAll(async () => {
    const ts = Date.now();
    const cA = await makeUserClient(`coach-ci-A-${ts}@test.local`);
    const cB = await makeUserClient(`coach-ci-B-${ts}@test.local`);
    const aA = await makeUserClient(`ath-ci-A-${ts}@test.local`);
    const aB = await makeUserClient(`ath-ci-B-${ts}@test.local`);
    coachAClient = cA.client; coachBClient = cB.client;
    athleteAClient = aA.client; athleteBClient = aB.client;

    const cArow = await admin.from('coaches').insert({
      auth_user_id: cA.userId, display_name: 'A', email: `coach-ci-A-${ts}@test.local`,
    }).select('id').single();
    const cBrow = await admin.from('coaches').insert({
      auth_user_id: cB.userId, display_name: 'B', email: `coach-ci-B-${ts}@test.local`,
    }).select('id').single();
    const aArow = await admin.from('athletes').insert({
      coach_id: cArow.data!.id, auth_user_id: aA.userId,
      name: 'A', email: `ath-ci-A-${ts}@test.local`, is_active: true,
    }).select('id').single();
    athleteAId = aArow.data!.id;
    await admin.from('athletes').insert({
      coach_id: cBrow.data!.id, auth_user_id: aB.userId,
      name: 'B', email: `ath-ci-B-${ts}@test.local`, is_active: true,
    });

    const ci = await admin.from('check_ins').insert({
      athlete_id: athleteAId, week_starting: '2026-04-27',
      bodyweight_lbs: 200, fatigue: 5, soreness: 4, confidence: 7, motivation: 8,
    }).select('id').single();
    checkInAId = ci.data!.id;
  });

  it('athlete A SELECTs own check-in', async () => {
    const { data } = await athleteAClient.from('check_ins').select('id').eq('id', checkInAId);
    expect(data?.length).toBe(1);
  });

  it('athlete B cannot SELECT athlete A check-in', async () => {
    const { data } = await athleteBClient.from('check_ins').select('id').eq('id', checkInAId);
    expect(data).toEqual([]);
  });

  it('coach A SELECTs athlete A check-in', async () => {
    const { data } = await coachAClient.from('check_ins').select('id').eq('id', checkInAId);
    expect(data?.length).toBe(1);
  });

  it('coach B cannot SELECT athlete A check-in', async () => {
    const { data } = await coachBClient.from('check_ins').select('id').eq('id', checkInAId);
    expect(data).toEqual([]);
  });

  it('coach A cannot UPDATE athlete A check-in', async () => {
    const { data } = await coachAClient.from('check_ins')
      .update({ comments: 'coach wrote' }).eq('id', checkInAId).select();
    expect(data ?? []).toEqual([]);
  });

  it('UNIQUE (athlete_id, week_starting) prevents duplicates', async () => {
    const { error } = await admin.from('check_ins').insert({
      athlete_id: athleteAId, week_starting: '2026-04-27',
      bodyweight_lbs: 201, fatigue: 5, soreness: 4, confidence: 7, motivation: 8,
    });
    expect(error).toBeTruthy();
  });
});
