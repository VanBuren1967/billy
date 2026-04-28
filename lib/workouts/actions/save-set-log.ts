'use server';

import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { getCurrentAthlete } from '@/lib/athletes/get-current-athlete';
import { saveSetLogSchema } from '../schemas';
import { workoutBreadcrumb } from '../breadcrumbs';

const GENERIC_DB_ERROR = 'Failed to save. Please try again.';

function mask(operation: string, error: { message: string }) {
  Sentry.captureException(new Error(`saveSetLog.${operation}: ${error.message}`));
  return { ok: false as const, reason: 'db_error' as const, message: GENERIC_DB_ERROR };
}

export async function saveSetLog(input: unknown) {
  const p = saveSetLogSchema.safeParse(input);
  if (!p.success) return { ok: false as const, reason: 'invalid' as const, message: p.error.message };
  await getCurrentAthlete();
  const supabase = await createClient();

  const update: Record<string, unknown> = {};
  if (p.data.weightLbs !== undefined) update.weight_lbs = p.data.weightLbs;
  if (p.data.repsDone !== undefined) update.reps_done = p.data.repsDone;
  if (p.data.rpe !== undefined) update.rpe = p.data.rpe;
  if (p.data.completed !== undefined) update.completed = p.data.completed;

  const { data, error } = await supabase
    .from('set_logs').update(update).eq('id', p.data.setLogId)
    .select('id, workout_log_id').maybeSingle();
  if (error) return mask('update', error);
  if (!data) return { ok: false as const, reason: 'not_found' as const, message: 'set log not found' };

  workoutBreadcrumb('workout.set_saved', {
    set_log_id: p.data.setLogId, workout_log_id: data.workout_log_id,
  });
  return { ok: true as const, setLogId: data.id };
}
