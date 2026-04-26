import { describe, it, expect, vi, beforeEach } from 'vitest';

const adminMock = {
  from: vi.fn(),
  auth: { admin: { inviteUserByEmail: vi.fn() } },
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => adminMock,
}));

import { inviteAthlete } from '@/lib/coach/invite-athlete';

function makeChain(opts: {
  lookup?: { data: unknown; error: unknown };
  update?: { error: unknown };
  insert?: { data: unknown; error: unknown };
}) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue(opts.lookup ?? { data: null, error: null }),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(opts.update ?? { error: null }),
    }),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi
          .fn()
          .mockResolvedValue(opts.insert ?? { data: { id: 'new-athlete-id' }, error: null }),
      }),
    }),
  };
}

describe('inviteAthlete', () => {
  beforeEach(() => {
    adminMock.from.mockReset();
    adminMock.auth.admin.inviteUserByEmail.mockReset();
    adminMock.auth.admin.inviteUserByEmail.mockResolvedValue({ error: null });
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
  });

  it('inserts athletes row + sends invite when none exists', async () => {
    adminMock.from.mockReturnValue(makeChain({ lookup: { data: null, error: null } }));
    const r = await inviteAthlete({ coachId: 'c1', name: 'Alice', email: 'alice@example.com' });
    expect(r).toEqual({ ok: true, athleteId: 'new-athlete-id', alreadyExisted: false });
    expect(adminMock.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
      'alice@example.com',
      expect.objectContaining({ redirectTo: expect.stringContaining('/auth/callback?next=/app') }),
    );
  });

  it('re-invites when existing row is invited', async () => {
    adminMock.from.mockReturnValue(
      makeChain({
        lookup: { data: { id: 'existing-id', status: 'invited' }, error: null },
      }),
    );
    const r = await inviteAthlete({ coachId: 'c1', name: 'Bob', email: 'bob@example.com' });
    expect(r).toEqual({ ok: true, athleteId: 'existing-id', alreadyExisted: true });
  });

  it('refuses when athlete is already active', async () => {
    adminMock.from.mockReturnValue(
      makeChain({
        lookup: { data: { id: 'existing-id', status: 'active' }, error: null },
      }),
    );
    const r = await inviteAthlete({ coachId: 'c1', name: 'Cara', email: 'cara@example.com' });
    expect(r).toEqual({
      ok: false,
      reason: 'duplicate_active',
      message: 'This athlete is already active.',
    });
    expect(adminMock.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('lowercases the email before lookup and invite', async () => {
    adminMock.from.mockReturnValue(makeChain({ lookup: { data: null, error: null } }));
    await inviteAthlete({ coachId: 'c1', name: 'Dan', email: '  Dan@Example.com  ' });
    expect(adminMock.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
      'dan@example.com',
      expect.anything(),
    );
  });

  it('returns invite_failed when Supabase invite errors', async () => {
    adminMock.from.mockReturnValue(makeChain({ lookup: { data: null, error: null } }));
    adminMock.auth.admin.inviteUserByEmail.mockResolvedValue({ error: { message: 'rate limited' } });
    const r = await inviteAthlete({ coachId: 'c1', name: 'Eve', email: 'eve@example.com' });
    expect(r).toEqual({ ok: false, reason: 'invite_failed', message: 'rate limited' });
  });
});
