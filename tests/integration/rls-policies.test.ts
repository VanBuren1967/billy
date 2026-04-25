import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const URL = 'http://localhost:54321';
// Service-role key from `supabase status` — local-only, safe to hardcode for tests.
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });

async function makeUserClient(email: string) {
  const { data: created } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (!created.user) throw new Error('createUser failed');

  // Issue a session for the user via signInWithPassword fallback (admin-set password).
  await admin.auth.admin.updateUserById(created.user.id, { password: 'TestPass123!' });
  // Unique storageKey per client so each user's session doesn't clobber the others
  // in the shared jsdom localStorage.
  const userClient = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, storageKey: `sb-test-${created.user.id}` },
  });
  await userClient.auth.signInWithPassword({ email, password: 'TestPass123!' });
  return { client: userClient, userId: created.user.id };
}

describe('RLS — coaches and athletes are isolated', () => {
  let coachAUserId: string;
  let coachBUserId: string;
  let coachAId: string;
  let coachBId: string;
  let athleteAClient: ReturnType<typeof createClient>;
  let athleteBClient: ReturnType<typeof createClient>;
  let athleteARowId: string;
  let athleteBRowId: string;

  beforeAll(async () => {
    // Two coaches, each with one athlete. Set up via service role.
    const ca = await makeUserClient(`coach-a-${Date.now()}@test.local`);
    coachAUserId = ca.userId;
    const cb = await makeUserClient(`coach-b-${Date.now()}@test.local`);
    coachBUserId = cb.userId;

    const { data: rowA } = await admin
      .from('coaches')
      .insert({ auth_user_id: coachAUserId, display_name: 'Coach A', email: `coach-a-${Date.now()}@test.local` })
      .select('id')
      .single();
    coachAId = rowA!.id;
    const { data: rowB } = await admin
      .from('coaches')
      .insert({ auth_user_id: coachBUserId, display_name: 'Coach B', email: `coach-b-${Date.now()}@test.local` })
      .select('id')
      .single();
    coachBId = rowB!.id;

    const aa = await makeUserClient(`athlete-a-${Date.now()}@test.local`);
    athleteAClient = aa.client;
    const ab = await makeUserClient(`athlete-b-${Date.now()}@test.local`);
    athleteBClient = ab.client;

    const { data: athA } = await admin
      .from('athletes')
      .insert({ coach_id: coachAId, auth_user_id: aa.userId, name: 'Athlete A', email: `ath-a-${Date.now()}@test.local` })
      .select('id')
      .single();
    athleteARowId = athA!.id;

    const { data: athB } = await admin
      .from('athletes')
      .insert({ coach_id: coachBId, auth_user_id: ab.userId, name: 'Athlete B', email: `ath-b-${Date.now()}@test.local` })
      .select('id')
      .single();
    athleteBRowId = athB!.id;
  }, 30_000);

  it("athlete A cannot read athlete B's row", async () => {
    const { data, error } = await athleteAClient
      .from('athletes')
      .select('id')
      .eq('id', athleteBRowId);
    expect(error).toBeNull();
    expect(data).toEqual([]); // RLS filters silently — no rows returned.
  });

  it('athlete A can read their own row', async () => {
    const { data, error } = await athleteAClient
      .from('athletes')
      .select('id')
      .eq('id', athleteARowId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});
