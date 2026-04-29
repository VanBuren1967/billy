import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(URL, SR, { auth: { persistSession: false } });

describe('join_requests pending-email partial unique index', () => {
  it('blocks a second pending row for the same email', async () => {
    const email = `dedupe-${Date.now()}@test.local`;
    const first = await admin.from('join_requests').insert({
      name: 'First', email, message: 'x',
    });
    expect(first.error).toBeNull();

    const second = await admin.from('join_requests').insert({
      name: 'Second', email, message: 'y',
    });
    expect(second.error).toBeTruthy();
    expect(second.error!.code).toBe('23505');
  });

  it('allows a re-submission once the first request has been declined', async () => {
    const email = `dedupe-decline-${Date.now()}@test.local`;
    const first = await admin.from('join_requests').insert({
      name: 'First', email, message: 'x',
    }).select('id').single();
    expect(first.error).toBeNull();
    const firstId = first.data!.id;

    await admin.from('join_requests').update({ status: 'declined' }).eq('id', firstId);

    const second = await admin.from('join_requests').insert({
      name: 'First again', email, message: 'y',
    });
    expect(second.error).toBeNull();
  });

  it('case-insensitive — Foo@x.com and foo@x.com collide', async () => {
    const email = `MixedCase-${Date.now()}@test.local`;
    const first = await admin.from('join_requests').insert({
      name: 'First', email,
    });
    expect(first.error).toBeNull();

    const second = await admin.from('join_requests').insert({
      name: 'Second', email: email.toLowerCase(),
    });
    expect(second.error).toBeTruthy();
    expect(second.error!.code).toBe('23505');
  });
});
