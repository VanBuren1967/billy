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
  let programADayId: string;
  let programAExerciseId: string;
  let programBId: string;

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

    // Seed a day + exercise under Coach A's program for child-table coverage.
    const day = await admin.from('program_days').insert({
      program_id: programAId, week_number: 1, day_number: 1, name: 'Squat day',
    }).select('id').single();
    programADayId = day.data!.id;

    const exr = await admin.from('program_exercises').insert({
      program_day_id: programADayId, position: 1, name: 'Squat',
      sets: 5, reps: '5',
    }).select('id').single();
    programAExerciseId = exr.data!.id;

    // Coach B owns a program too, so we can test "move into wrong-coach parent".
    const pb = await admin.from('programs').insert({
      coach_id: coachBId, name: 'B Program', block_type: 'general', total_weeks: 1,
    }).select('id').single();
    programBId = pb.data!.id;
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
    const { data } = await coachBClient.from('programs')
      .update({ name: 'hijacked' }).eq('id', programAId).select();
    expect(data ?? []).toEqual([]);
  });

  it('coach B cannot SELECT coach A\'s program_days', async () => {
    const { data } = await coachBClient.from('program_days').select('id').eq('id', programADayId);
    expect(data).toEqual([]);
  });

  it('coach B cannot SELECT coach A\'s program_exercises', async () => {
    const { data } = await coachBClient.from('program_exercises').select('id').eq('id', programAExerciseId);
    expect(data).toEqual([]);
  });

  it('coach B cannot INSERT a program_day under coach A\'s program', async () => {
    const { error } = await coachBClient.from('program_days').insert({
      program_id: programAId, week_number: 99, day_number: 99, name: 'Spoof',
    });
    expect(error).toBeTruthy();
    expect(error!.message.toLowerCase()).toMatch(/row.level|policy|violates/);
  });

  it('coach A cannot UPDATE a program_day to belong to coach B\'s program (WITH CHECK enforces post-update)', async () => {
    const { error, data } = await coachAClient.from('program_days')
      .update({ program_id: programBId }).eq('id', programADayId).select();
    // The WITH CHECK clause should reject this since programBId is not in
    // coach A's set of accessible programs. Either an error is raised, or
    // the update is silently filtered (depending on PG / supabase-js wrapping).
    if (error) {
      expect(error.message.toLowerCase()).toMatch(/row.level|policy|violates|check/);
    } else {
      expect(data ?? []).toEqual([]);
      // Verify the row was NOT moved.
      const { data: after } = await admin.from('program_days')
        .select('program_id').eq('id', programADayId).single();
      expect(after?.program_id).toBe(programAId);
    }
  });
});
