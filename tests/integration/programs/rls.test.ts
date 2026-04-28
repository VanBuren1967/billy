import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });

async function makeUserClient(email: string) {
  const { data: created } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (!created.user) throw new Error('createUser failed');
  await admin.auth.admin.updateUserById(created.user.id, { password: 'TestPass123!' });
  const userClient = createClient(URL, ANON, {
    auth: { persistSession: false, storageKey: `sb-test-${created.user.id}` },
  });
  await userClient.auth.signInWithPassword({ email, password: 'TestPass123!' });
  return { client: userClient, userId: created.user.id };
}

describe('RLS — programs / program_days / program_exercises', () => {
  let coachAClient: SupabaseClient;
  let coachBClient: SupabaseClient;
  let coachAId: string;
  let coachBId: string;
  let programAId: string;

  beforeAll(async () => {
    const ts = Date.now();
    const ca = await makeUserClient(`coach-a-prog-${ts}@test.local`);
    const cb = await makeUserClient(`coach-b-prog-${ts}@test.local`);
    coachAClient = ca.client;
    coachBClient = cb.client;

    const a = await admin.from('coaches').insert({
      auth_user_id: ca.userId, display_name: 'Coach A', email: `coach-a-prog-${ts}@test.local`,
    }).select('id').single();
    coachAId = a.data!.id;

    const b = await admin.from('coaches').insert({
      auth_user_id: cb.userId, display_name: 'Coach B', email: `coach-b-prog-${ts}@test.local`,
    }).select('id').single();
    coachBId = b.data!.id;

    const p = await admin.from('programs').insert({
      coach_id: coachAId, name: 'A Program', block_type: 'strength', total_weeks: 4,
    }).select('id').single();
    programAId = p.data!.id;
  });

  it('coach B cannot SELECT coach A\'s programs', async () => {
    const { data } = await coachBClient.from('programs').select('id').eq('id', programAId);
    expect(data).toEqual([]);
  });

  it('coach A can SELECT their own programs', async () => {
    const { data } = await coachAClient.from('programs').select('id').eq('id', programAId);
    expect(data?.length).toBe(1);
  });

  it('coach B cannot INSERT a program with coach_id = coach A', async () => {
    const { error } = await coachBClient.from('programs').insert({
      coach_id: coachAId, name: 'Spoof', block_type: 'general', total_weeks: 1,
    });
    expect(error).toBeTruthy();
    expect(error!.message.toLowerCase()).toMatch(/row.level|policy|violates/);
  });

  it('coach B cannot UPDATE coach A\'s program', async () => {
    const { error, data } = await coachBClient.from('programs')
      .update({ name: 'hijacked' }).eq('id', programAId).select();
    expect(data ?? []).toEqual([]);
  });
});
