import 'server-only';
import { createClient } from '@/lib/supabase/server';

export type CurrentCoach = {
  authUserId: string;
  id: string;
  displayName: string;
};

/**
 * Resolve the current authenticated user → their coaches row.
 *
 * Throws on:
 * - unauthenticated (no auth.uid())
 * - authenticated but no matching coaches row (i.e. an athlete or stranger
 *   trying to hit a coach-only action — middleware should already have
 *   bounced, but this is the second-line defense)
 *
 * RLS will independently block any subsequent query a misconfigured caller
 * tries to run against another coach's data.
 */
export async function getCurrentCoach(): Promise<CurrentCoach> {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) {
    throw new Error('unauthenticated');
  }
  const { data: coach, error } = await supabase
    .from('coaches')
    .select('id, display_name')
    .eq('auth_user_id', userRes.user.id)
    .maybeSingle();
  if (error) {
    throw new Error(`coach_lookup_failed: ${error.message}`);
  }
  if (!coach) {
    throw new Error('not_a_coach');
  }
  return {
    authUserId: userRes.user.id,
    id: coach.id,
    displayName: coach.display_name,
  };
}
