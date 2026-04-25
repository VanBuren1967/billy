import type { SupabaseClient } from '@supabase/supabase-js';

export type UserRole =
  | { kind: 'coach'; coachId: string }
  | { kind: 'athlete'; athleteId: string; coachId: string }
  | { kind: 'unauthenticated' }
  | { kind: 'unlinked' }; // logged in but not yet linked to coach or athlete row

export async function getUserRole(supabase: SupabaseClient): Promise<UserRole> {
  // Errors from getUser() and the lookups below are intentionally treated as
  // "unauthenticated" — fail-closed → redirect to /login is better UX than a 500
  // mid-request, and the user can recover by clicking their magic link again.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: 'unauthenticated' };

  // Coach precedence: if a row somehow exists in BOTH tables for the same
  // auth_user_id (shouldn't happen — Plan 7 will add a DB constraint enforcing
  // it), we resolve to the higher-privilege role (coach) for consistent gating.
  const { data: coach } = await supabase
    .from('coaches')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (coach) return { kind: 'coach', coachId: coach.id };

  const { data: athlete } = await supabase
    .from('athletes')
    .select('id, coach_id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (athlete) return { kind: 'athlete', athleteId: athlete.id, coachId: athlete.coach_id };

  return { kind: 'unlinked' };
}
