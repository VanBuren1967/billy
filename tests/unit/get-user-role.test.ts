import { describe, it, expect, vi } from 'vitest';
import { getUserRole } from '@/lib/auth/get-user-role';

function mockSupabase(opts: {
  user?: { id: string } | null;
  coach?: { id: string } | null;
  athlete?: { id: string; coach_id: string } | null;
}) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: opts.user ?? null } }) },
    from: vi.fn((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: table === 'coaches' ? (opts.coach ?? null) : (opts.athlete ?? null),
      }),
    })),
  } as never;
}

describe('getUserRole', () => {
  it('returns unauthenticated when no user', async () => {
    const role = await getUserRole(mockSupabase({ user: null }));
    expect(role).toEqual({ kind: 'unauthenticated' });
  });

  it('returns coach when coach row exists', async () => {
    const role = await getUserRole(mockSupabase({ user: { id: 'u1' }, coach: { id: 'c1' } }));
    expect(role).toEqual({ kind: 'coach', coachId: 'c1' });
  });

  it('returns athlete when athlete row exists', async () => {
    const role = await getUserRole(
      mockSupabase({ user: { id: 'u1' }, athlete: { id: 'a1', coach_id: 'c1' } }),
    );
    expect(role).toEqual({ kind: 'athlete', athleteId: 'a1', coachId: 'c1' });
  });

  it('returns unlinked when user has no coach or athlete row', async () => {
    const role = await getUserRole(mockSupabase({ user: { id: 'u1' } }));
    expect(role).toEqual({ kind: 'unlinked' });
  });
});
