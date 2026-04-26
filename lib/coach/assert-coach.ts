import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/auth/get-user-role';

export class NotCoachError extends Error {
  constructor() {
    super('Caller is not authenticated as a coach.');
    this.name = 'NotCoachError';
  }
}

export async function assertCoach(): Promise<{ coachId: string }> {
  const supabase = await createClient();
  const role = await getUserRole(supabase);
  if (role.kind !== 'coach') throw new NotCoachError();
  return { coachId: role.coachId };
}
