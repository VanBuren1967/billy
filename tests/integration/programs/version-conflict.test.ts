import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(URL, SR, { auth: { persistSession: false } });

describe('version-conflict — concurrent edits', () => {
  let coachId: string;
  let programId: string;

  beforeAll(async () => {
    const email = `conflict-${Date.now()}@test.local`;
    const u = await admin.auth.admin.createUser({ email, email_confirm: true });
    const c = await admin.from('coaches').insert({
      auth_user_id: u.data.user!.id, display_name: 'C', email,
    }).select('id').single();
    coachId = c.data!.id;
    const p = await admin.from('programs').insert({
      coach_id: coachId, name: 'P', block_type: 'general', total_weeks: 1, version: 1,
    }).select('id').single();
    programId = p.data!.id;
  });

  it('first update with expected version succeeds', async () => {
    const { data } = await admin.from('programs')
      .update({ version: 2, name: 'P-A' })
      .eq('id', programId).eq('version', 1)
      .select('id, version').maybeSingle();
    expect(data?.version).toBe(2);
  });

  it('second update with stale version returns no row', async () => {
    const { data } = await admin.from('programs')
      .update({ version: 3, name: 'P-B' })
      .eq('id', programId).eq('version', 1) // stale
      .select('id, version').maybeSingle();
    expect(data).toBeNull();
    const cur = await admin.from('programs').select('version, name').eq('id', programId).single();
    expect(cur.data?.version).toBe(2);
    expect(cur.data?.name).toBe('P-A');
  });

  it('retry with fresh version succeeds', async () => {
    const { data } = await admin.from('programs')
      .update({ version: 3, name: 'P-B-retry' })
      .eq('id', programId).eq('version', 2)
      .select('id, version').maybeSingle();
    expect(data?.version).toBe(3);
  });
});
