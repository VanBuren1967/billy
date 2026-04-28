'use server';

import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { getCurrentAthlete } from '@/lib/athletes/get-current-athlete';
import { markWorkoutCompleteSchema } from '../schemas';
import { workoutBreadcrumb } from '../breadcrumbs';

const GENERIC_DB_ERROR = 'Failed to update workout. Please try again.';

function mask(operation: string, error: { message: string }) {
  Sentry.captureException(new Error(`markWorkoutComplete.${operation}: ${error.message}`));
  return { ok: false as const, reason: 'db_error' as const, message: GENERIC_DB_ERROR };
}

export async function markWorkoutComplete(input: unknown) {
  const p = markWorkoutCompleteSchema.safeParse(input);
  if (!p.success) return { ok: false as const, reason: 'invalid' as const, message: p.error.message };
  await getCurrentAthlete();
  const supabase = await createClient();

  const { data: current } = await supabase.from('workout_logs')
    .select('id, status, completed_at').eq('id', p.data.workoutLogId).maybeSingle();
  if (!current) return { ok: false as const, reason: 'not_found' as const, message: 'workout log not found' };

  const update: Record<string, unknown> = { status: 'completed' };
  if (!current.completed_at) update.completed_at = new Date().toISOString();

  const { error } = await supabase.from('workout_logs').update(update).eq('id', p.data.workoutLogId);
  if (error) return mask('update', error);

  workoutBreadcrumb('workout.completed', { workout_log_id: p.data.workoutLogId });
  return { ok: true as const };
}

export async function reopenWorkout(input: unknown) {
  const p = markWorkoutCompleteSchema.safeParse(input);
  if (!p.success) return { ok: false as const, reason: 'invalid' as const, message: p.error.message };
  await getCurrentAthlete();
  const supabase = await createClient();

  const { error } = await supabase.from('workout_logs')
    .update({ status: 'in_progress', completed_at: null })
    .eq('id', p.data.workoutLogId);
  if (error) return mask('update', error);

  workoutBreadcrumb('workout.reopened', { workout_log_id: p.data.workoutLogId });
  return { ok: true as const };
}
