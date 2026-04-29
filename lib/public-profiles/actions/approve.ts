'use server';

import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { getCurrentCoach } from '@/lib/programs/get-current-coach';

const GENERIC_DB_ERROR = 'Failed to update profile. Please try again.';

function mask(operation: string, error: { message: string }) {
  Sentry.captureException(new Error(`approvePublicProfile.${operation}: ${error.message}`));
  return { ok: false as const, reason: 'db_error' as const, message: GENERIC_DB_ERROR };
}

export async function approvePublicProfile(athleteId: string) {
  const coach = await getCurrentCoach();
  const supabase = await createClient();

  // Verify athlete belongs to this coach
  const { data: athlete } = await supabase.from('athletes')
    .select('id, coach_id').eq('id', athleteId).maybeSingle();
  if (!athlete || athlete.coach_id !== coach.id) {
    return { ok: false as const, reason: 'not_found' as const, message: 'athlete not in roster' };
  }

  const { error } = await supabase
    .from('athlete_public_profiles')
    .update({
      is_published: true,
      published_at: new Date().toISOString(),
      coach_approved_by: coach.id,
    })
    .eq('athlete_id', athleteId);
  if (error) return mask('approve', error);
  return { ok: true as const };
}

export async function unpublishPublicProfile(athleteId: string) {
  const coach = await getCurrentCoach();
  const supabase = await createClient();

  const { data: athlete } = await supabase.from('athletes')
    .select('id, coach_id').eq('id', athleteId).maybeSingle();
  if (!athlete || athlete.coach_id !== coach.id) {
    return { ok: false as const, reason: 'not_found' as const, message: 'athlete not in roster' };
  }

  const { error } = await supabase
    .from('athlete_public_profiles')
    .update({ is_published: false, published_at: null, coach_approved_by: null })
    .eq('athlete_id', athleteId);
  if (error) return mask('unpublish', error);
  return { ok: true as const };
}
