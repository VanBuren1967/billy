import type { SupabaseClient } from '@supabase/supabase-js';

export type UserRole =
  | { kind: 'coach'; coachId: string }
  | { kind: 'athlete'; athleteId: string; coachId: string }
  | { kind: 'unauthenticated' }
  | { kind: 'unlinked' }; // logged in but not yet linked to coach or athlete row

export async function getUserRole(supabase: SupabaseClient): Promise<UserRole> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: 'unauthenticated' };

  // Try coach lookup first.
  const { data: coach } = await supabase
    .from('coaches')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (coach) return { kind: 'coach', coachId: coach.id };

  // Then athlete.
  const { data: athlete } = await supabase
    .from('athletes')
    .select('id, coach_id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (athlete) return { kind: 'athlete', athleteId: athlete.id, coachId: athlete.coach_id };

  return { kind: 'unlinked' };
}
