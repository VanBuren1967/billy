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

describe('athlete profile metadata', () => {
  let coachAClient: SupabaseClient;
  let coachBClient: SupabaseClient;
  let athleteAId: string;

  beforeAll(async () => {
    const ts = Date.now();
    const cA = await makeUserClient(`coach-pm-A-${ts}@test.local`);
    const cB = await makeUserClient(`coach-pm-B-${ts}@test.local`);
    coachAClient = cA.client; coachBClient = cB.client;

    const cArow = await admin.from('coaches').insert({
      auth_user_id: cA.userId, display_name: 'A', email: `coach-pm-A-${ts}@test.local`,
    }).select('id').single();
    await admin.from('coaches').insert({
      auth_user_id: cB.userId, display_name: 'B', email: `coach-pm-B-${ts}@test.local`,
    });

    const a = await admin.from('athletes').insert({
      coach_id: cArow.data!.id, name: 'A', email: `ath-pm-${ts}@test.local`, is_active: true,
    }).select('id').single();
    athleteAId = a.data!.id;
  });

  it('coach A can UPDATE their own athlete metadata', async () => {
    const { data, error } = await coachAClient.from('athletes')
      .update({
        weight_class: '198', raw_or_equipped: 'raw',
        current_squat_max: 405, goal: 'meet_prep',
      })
      .eq('id', athleteAId).select('weight_class, current_squat_max, goal');
    expect(error).toBeNull();
    expect(data?.[0]?.weight_class).toBe('198');
    expect(Number(data?.[0]?.current_squat_max)).toBe(405);
    expect(data?.[0]?.goal).toBe('meet_prep');
  });

  it('coach B cannot UPDATE coach A\'s athlete', async () => {
    const { data } = await coachBClient.from('athletes')
      .update({ weight_class: 'hijack' }).eq('id', athleteAId).select();
    expect(data ?? []).toEqual([]);
  });

  it('check constraint rejects invalid goal value', async () => {
    const { error } = await coachAClient.from('athletes')
      .update({ goal: 'invalid_goal' }).eq('id', athleteAId);
    expect(error).toBeTruthy();
  });

  it('check constraint rejects negative current_squat_max', async () => {
    const { error } = await coachAClient.from('athletes')
      .update({ current_squat_max: -100 }).eq('id', athleteAId);
    expect(error).toBeTruthy();
  });
});
