import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUserRoleMock = vi.fn();
const createClientMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => createClientMock(),
}));
vi.mock('@/lib/auth/get-user-role', () => ({
  getUserRole: (c: unknown) => getUserRoleMock(c),
}));

import { assertCoach, NotCoachError } from '@/lib/coach/assert-coach';

describe('assertCoach', () => {
  beforeEach(() => {
    getUserRoleMock.mockReset();
    createClientMock.mockReset();
    createClientMock.mockResolvedValue({});
  });

  it('returns the coachId when role is coach', async () => {
    getUserRoleMock.mockResolvedValue({ kind: 'coach', coachId: 'c1' });
    await expect(assertCoach()).resolves.toEqual({ coachId: 'c1' });
  });

  it('throws NotCoachError when role is athlete', async () => {
    getUserRoleMock.mockResolvedValue({ kind: 'athlete', athleteId: 'a1', coachId: 'c1' });
    await expect(assertCoach()).rejects.toBeInstanceOf(NotCoachError);
  });

  it('throws NotCoachError when unauthenticated', async () => {
    getUserRoleMock.mockResolvedValue({ kind: 'unauthenticated' });
    await expect(assertCoach()).rejects.toBeInstanceOf(NotCoachError);
  });

  it('throws NotCoachError when unlinked', async () => {
    getUserRoleMock.mockResolvedValue({ kind: 'unlinked' });
    await expect(assertCoach()).rejects.toBeInstanceOf(NotCoachError);
  });
});
