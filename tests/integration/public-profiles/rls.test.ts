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

describe('RLS — athlete_public_profiles', () => {
  let athleteAClient: SupabaseClient;
  let athleteBClient: SupabaseClient;
  let coachAClient: SupabaseClient;
  let coachBClient: SupabaseClient;
  let anonClient: SupabaseClient;
  let unpublishedProfileId: string;
  let publishedProfileId: string;
  let athleteAId: string;
  let athleteBId: string;

  beforeAll(async () => {
    const ts = Date.now();
    const cA = await makeUserClient(`coach-pp-A-${ts}@test.local`);
    const cB = await makeUserClient(`coach-pp-B-${ts}@test.local`);
    const aA = await makeUserClient(`ath-pp-A-${ts}@test.local`);
    const aB = await makeUserClient(`ath-pp-B-${ts}@test.local`);
    coachAClient = cA.client; coachBClient = cB.client;
    athleteAClient = aA.client; athleteBClient = aB.client;
    anonClient = createClient(URL, ANON, {
      auth: { persistSession: false, storageKey: `sb-test-anon-${ts}` },
    });

    const cArow = await admin.from('coaches').insert({
      auth_user_id: cA.userId, display_name: 'A', email: `coach-pp-A-${ts}@test.local`,
    }).select('id').single();
    const cBrow = await admin.from('coaches').insert({
      auth_user_id: cB.userId, display_name: 'B', email: `coach-pp-B-${ts}@test.local`,
    }).select('id').single();
    const aArow = await admin.from('athletes').insert({
      coach_id: cArow.data!.id, auth_user_id: aA.userId,
      name: 'Alex Reyes', email: `ath-pp-A-${ts}@test.local`, is_active: true,
    }).select('id').single();
    athleteAId = aArow.data!.id;
    const aBrow = await admin.from('athletes').insert({
      coach_id: cBrow.data!.id, auth_user_id: aB.userId,
      name: 'Brook Smith', email: `ath-pp-B-${ts}@test.local`, is_active: true,
    }).select('id').single();
    athleteBId = aBrow.data!.id;

    // Athlete A's UNPUBLISHED profile (default).
    const unpub = await admin.from('athlete_public_profiles').insert({
      athlete_id: athleteAId,
      slug: `alex-reyes-${ts}`,
      headline: 'Powerlifter from Houston',
      bio: 'Bio in progress.',
      recent_meet_results: [],
    }).select('id').single();
    unpublishedProfileId = unpub.data!.id;

    // Athlete B's PUBLISHED profile.
    const pub = await admin.from('athlete_public_profiles').insert({
      athlete_id: athleteBId,
      slug: `brook-smith-${ts}`,
      headline: 'Multi-meet champ',
      bio: 'Brook bio.',
      recent_meet_results: [],
      is_published: true,
      published_at: new Date().toISOString(),
      coach_approved_by: cBrow.data!.id,
    }).select('id').single();
    publishedProfileId = pub.data!.id;
  });

  it('athlete A SELECTs own profile (any state)', async () => {
    const { data } = await athleteAClient.from('athlete_public_profiles')
      .select('id').eq('id', unpublishedProfileId);
    expect(data?.length).toBe(1);
  });

  it('athlete B cannot SELECT athlete A unpublished profile', async () => {
    const { data } = await athleteBClient.from('athlete_public_profiles')
      .select('id').eq('id', unpublishedProfileId);
    expect(data).toEqual([]);
  });

  it('coach A SELECTs athlete A profile (any state)', async () => {
    const { data } = await coachAClient.from('athlete_public_profiles')
      .select('id').eq('id', unpublishedProfileId);
    expect(data?.length).toBe(1);
  });

  it('coach B cannot SELECT athlete A profile', async () => {
    const { data } = await coachBClient.from('athlete_public_profiles')
      .select('id').eq('id', unpublishedProfileId);
    expect(data).toEqual([]);
  });

  it('anonymous client can SELECT a PUBLISHED profile', async () => {
    const { data } = await anonClient.from('athlete_public_profiles')
      .select('id').eq('id', publishedProfileId);
    expect(data?.length).toBe(1);
  });

  it('anonymous client cannot SELECT an UNPUBLISHED profile', async () => {
    const { data } = await anonClient.from('athlete_public_profiles')
      .select('id').eq('id', unpublishedProfileId);
    expect(data).toEqual([]);
  });
});
