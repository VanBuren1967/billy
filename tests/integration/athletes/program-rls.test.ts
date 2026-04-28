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

describe('RLS — athlete program viewer SELECT policies', () => {
  let athleteAClient: SupabaseClient;
  let coachClient: SupabaseClient;
  let athleteAProgramId: string;
  let athleteBProgramId: string;
  let coachTemplateId: string;

  beforeAll(async () => {
    const ts = Date.now();
    const coach = await makeUserClient(`coach-vp-${ts}@test.local`);
    const aA = await makeUserClient(`athlete-a-vp-${ts}@test.local`);
    const aB = await makeUserClient(`athlete-b-vp-${ts}@test.local`);
    coachClient = coach.client;
    athleteAClient = aA.client;

    // Coach + 2 athletes.
    const c = await admin.from('coaches').insert({
      auth_user_id: coach.userId, display_name: 'Coach', email: `coach-vp-${ts}@test.local`,
    }).select('id').single();
    const aARow = await admin.from('athletes').insert({
      coach_id: c.data!.id, auth_user_id: aA.userId,
      name: 'A', email: `athlete-a-vp-${ts}@test.local`, is_active: true,
    }).select('id').single();
    const aBRow = await admin.from('athletes').insert({
      coach_id: c.data!.id, auth_user_id: aB.userId,
      name: 'B', email: `athlete-b-vp-${ts}@test.local`, is_active: true,
    }).select('id').single();

    // Two assigned programs (one per athlete) + one template.
    const pA = await admin.from('programs').insert({
      coach_id: c.data!.id, athlete_id: aARow.data!.id, name: 'A program',
      block_type: 'general', total_weeks: 1, is_template: false,
    }).select('id').single();
    athleteAProgramId = pA.data!.id;
    const pB = await admin.from('programs').insert({
      coach_id: c.data!.id, athlete_id: aBRow.data!.id, name: 'B program',
      block_type: 'general', total_weeks: 1, is_template: false,
    }).select('id').single();
    athleteBProgramId = pB.data!.id;
    const tpl = await admin.from('programs').insert({
      coach_id: c.data!.id, name: 'Template', block_type: 'general', total_weeks: 1, is_template: true,
    }).select('id').single();
    coachTemplateId = tpl.data!.id;
  });

  it('athlete A SELECTs their own program', async () => {
    const { data } = await athleteAClient.from('programs').select('id').eq('id', athleteAProgramId);
    expect(data?.length).toBe(1);
  });

  it('athlete A cannot SELECT athlete B\'s program', async () => {
    const { data } = await athleteAClient.from('programs').select('id').eq('id', athleteBProgramId);
    expect(data).toEqual([]);
  });

  it('athlete A cannot SELECT any template', async () => {
    const { data } = await athleteAClient.from('programs').select('id').eq('id', coachTemplateId);
    expect(data).toEqual([]);
  });

  it('athlete A cannot INSERT a program', async () => {
    const { data: coachRow } = await admin.from('coaches').select('id').limit(1).single();
    const { error } = await athleteAClient.from('programs').insert({
      coach_id: coachRow!.id, name: 'spoof', block_type: 'general', total_weeks: 1,
    });
    expect(error).toBeTruthy();
  });

  it('athlete A cannot UPDATE their own program', async () => {
    const { data } = await athleteAClient.from('programs')
      .update({ name: 'hijacked' }).eq('id', athleteAProgramId).select();
    expect(data ?? []).toEqual([]);
  });

  it('coach can still SELECT all their own programs (no regression)', async () => {
    const { data } = await coachClient.from('programs').select('id');
    expect(data?.length).toBe(3);
  });
});
