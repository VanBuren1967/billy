'use server';

import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { getCurrentAthlete } from '@/lib/athletes/get-current-athlete';
import { saveWorkoutNotesSchema } from '../schemas';
import { workoutBreadcrumb } from '../breadcrumbs';

const GENERIC_DB_ERROR = 'Failed to save notes. Please try again.';

function mask(operation: string, error: { message: string }) {
  Sentry.captureException(new Error(`saveWorkoutNotes.${operation}: ${error.message}`));
  return { ok: false as const, reason: 'db_error' as const, message: GENERIC_DB_ERROR };
}

export async function saveWorkoutNotes(input: unknown) {
  const p = saveWorkoutNotesSchema.safeParse(input);
  if (!p.success) return { ok: false as const, reason: 'invalid' as const, message: p.error.message };
  await getCurrentAthlete();
  const supabase = await createClient();

  const update: Record<string, unknown> = {};
  if (p.data.painNotes !== undefined) update.pain_notes = p.data.painNotes;
  if (p.data.generalNotes !== undefined) update.general_notes = p.data.generalNotes;

  const { data, error } = await supabase
    .from('workout_logs').update(update).eq('id', p.data.workoutLogId)
    .select('id').maybeSingle();
  if (error) return mask('update', error);
  if (!data) return { ok: false as const, reason: 'not_found' as const, message: 'workout log not found' };

  workoutBreadcrumb('workout.notes_saved', { workout_log_id: p.data.workoutLogId });
  return { ok: true as const };
}
