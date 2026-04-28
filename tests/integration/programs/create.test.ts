import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const admin = createClient(URL, SR, { auth: { persistSession: false } });

async function makeCoach(prefix: string) {
  const email = `${prefix}-${Date.now()}@test.local`;
  const u = await admin.auth.admin.createUser({ email, email_confirm: true, password: 'TestPass123!' });
  if (!u.data.user) throw new Error('createUser');
  const c = await admin.from('coaches').insert({
    auth_user_id: u.data.user.id, display_name: prefix, email,
  }).select('id').single();
  const client = createClient(URL, ANON, {
    auth: { persistSession: false, storageKey: `sb-test-${u.data.user.id}` },
  });
  await client.auth.signInWithPassword({ email, password: 'TestPass123!' });
  return { client, coachId: c.data!.id, userId: u.data.user.id };
}

describe('createProgram (integration via direct DB calls under coach RLS)', () => {
  let A: Awaited<ReturnType<typeof makeCoach>> & { templateId?: string };

  beforeAll(async () => {
    A = await makeCoach('coach-create') as typeof A;
    const tpl = await admin.from('programs').insert({
      coach_id: A.coachId, name: 'Template X', block_type: 'strength', total_weeks: 4, is_template: true,
    }).select('id').single();
    const day = await admin.from('program_days').insert({
      program_id: tpl.data!.id, week_number: 1, day_number: 1, name: 'Squat',
    }).select('id').single();
    await admin.from('program_exercises').insert({
      program_day_id: day.data!.id, position: 1, name: 'Squat', sets: 5, reps: '5', load_pct: 75,
    });
    A.templateId = tpl.data!.id;
  });

  it('blank mode: coach can insert their own program via RLS', async () => {
    const { data, error } = await A.client.from('programs').insert({
      coach_id: A.coachId, name: 'Blank', block_type: 'general', total_weeks: 2,
    }).select('id').single();
    expect(error).toBeNull();
    expect(data?.id).toBeDefined();
  });

  it('duplicate flow: coach can read their own template + insert a fresh shape', async () => {
    const { data: src } = await A.client.from('programs').select('*').eq('id', A.templateId!).single();
    expect(src).toBeTruthy();
    const newProg = await A.client.from('programs').insert({
      coach_id: A.coachId, name: src!.name + ' (copy)', block_type: src!.block_type,
      total_weeks: src!.total_weeks, is_template: false,
    }).select('id').single();
    expect(newProg.error).toBeNull();
    expect(newProg.data!.id).not.toBe(A.templateId);
  });

  it('list query: coach sees their own programs (incl. the ones we just inserted)', async () => {
    const { data } = await A.client.from('programs').select('id, name').limit(50);
    expect((data ?? []).some((r) => r.name === 'Blank')).toBe(true);
  });
});
