import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(URL, SR, { auth: { persistSession: false } });

describe('archive / restore', () => {
  let coachId: string, programId: string;
  beforeAll(async () => {
    const email = `arch-${Date.now()}@test.local`;
    const u = await admin.auth.admin.createUser({ email, email_confirm: true });
    const c = await admin.from('coaches').insert({
      auth_user_id: u.data.user!.id, display_name: 'C', email,
    }).select('id').single();
    coachId = c.data!.id;
    const p = await admin.from('programs').insert({
      coach_id: coachId, name: 'arch', block_type: 'general', total_weeks: 1,
    }).select('id').single();
    programId = p.data!.id;
  });

  it('archive sets is_active=false', async () => {
    await admin.from('programs').update({ is_active: false }).eq('id', programId);
    const { data } = await admin.from('programs').select('is_active').eq('id', programId).single();
    expect(data?.is_active).toBe(false);
  });

  it('restore sets is_active=true', async () => {
    await admin.from('programs').update({ is_active: true }).eq('id', programId);
    const { data } = await admin.from('programs').select('is_active').eq('id', programId).single();
    expect(data?.is_active).toBe(true);
  });
});
