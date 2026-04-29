'use server';

import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { getCurrentCoach } from '@/lib/programs/get-current-coach';
import { athleteProfileSchema } from './schema';

const GENERIC_DB_ERROR = 'Failed to save profile. Please try again.';

function mask(operation: string, error: { message: string }) {
  Sentry.captureException(new Error(`saveAthleteProfile.${operation}: ${error.message}`));
  return { ok: false as const, reason: 'db_error' as const, message: GENERIC_DB_ERROR };
}

export async function saveAthleteProfile(input: unknown) {
  const p = athleteProfileSchema.safeParse(input);
  if (!p.success) return { ok: false as const, reason: 'invalid' as const, message: p.error.message };
  const coach = await getCurrentCoach();
  const supabase = await createClient();

  // Verify athlete belongs to this coach
  const { data: athlete } = await supabase.from('athletes')
    .select('id, coach_id').eq('id', p.data.athleteId).maybeSingle();
  if (!athlete || athlete.coach_id !== coach.id) {
    return { ok: false as const, reason: 'not_found' as const, message: 'athlete not in roster' };
  }

  const update = {
    weight_class: p.data.weightClass ?? null,
    raw_or_equipped: p.data.rawOrEquipped ?? null,
    current_squat_max: p.data.currentSquatMax ?? null,
    current_bench_max: p.data.currentBenchMax ?? null,
    current_deadlift_max: p.data.currentDeadliftMax ?? null,
    weak_points: p.data.weakPoints ?? null,
    injury_history: p.data.injuryHistory ?? null,
    experience_level: p.data.experienceLevel ?? null,
    goal: p.data.goal ?? null,
    meet_date: p.data.meetDate ?? null,
    meet_name: p.data.meetName ?? null,
    coaching_type: p.data.coachingType ?? null,
  };

  const { error } = await supabase.from('athletes').update(update).eq('id', p.data.athleteId);
  if (error) return mask('update', error);
  return { ok: true as const };
}
