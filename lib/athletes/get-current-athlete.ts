import 'server-only';
import { createClient } from '@/lib/supabase/server';

export type CurrentAthlete = {
  authUserId: string;
  id: string;
  name: string;
  coachId: string;
};

/**
 * Resolve the current authenticated user → their athletes row.
 *
 * Throws on:
 * - unauthenticated (no auth.uid())
 * - authenticated but no matching athletes row (e.g. a coach trying to hit /app)
 *
 * RLS independently blocks any cross-athlete read attempted by a misconfigured
 * caller.
 */
export async function getCurrentAthlete(): Promise<CurrentAthlete> {
  const supabase = await createClient();
  const { data: userRes, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    throw new Error(`auth_lookup_failed: ${authErr.message}`);
  }
  if (!userRes?.user) {
    throw new Error('unauthenticated');
  }
  const { data: athlete, error } = await supabase
    .from('athletes')
    .select('id, name, coach_id')
    .eq('auth_user_id', userRes.user.id)
    .maybeSingle();
  if (error) {
    throw new Error(`athlete_lookup_failed: ${error.message}`);
  }
  if (!athlete) {
    throw new Error('not_an_athlete');
  }
  return {
    authUserId: userRes.user.id,
    id: athlete.id,
    name: athlete.name,
    coachId: athlete.coach_id,
  };
}
