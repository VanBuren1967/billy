'use server';

import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { getCurrentAthlete } from '@/lib/athletes/get-current-athlete';
import { saveCheckInSchema } from '../schemas';
import { computeWeekStarting } from '../week-starting';
import { checkInBreadcrumb } from '../breadcrumbs';

const GENERIC_DB_ERROR = 'Failed to save check-in. Please try again.';

function mask(operation: string, error: { message: string }) {
  Sentry.captureException(new Error(`saveCheckIn.${operation}: ${error.message}`));
  return { ok: false as const, reason: 'db_error' as const, message: GENERIC_DB_ERROR };
}

export async function saveCheckIn(input: unknown) {
  const p = saveCheckInSchema.safeParse(input);
  if (!p.success) return { ok: false as const, reason: 'invalid' as const, message: p.error.message };
  const athlete = await getCurrentAthlete();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const weekStarting = computeWeekStarting(today);

  const { data: existing } = await supabase
    .from('check_ins')
    .select('id')
    .eq('athlete_id', athlete.id)
    .eq('week_starting', weekStarting)
    .maybeSingle();

  const payload = {
    athlete_id: athlete.id,
    week_starting: weekStarting,
    bodyweight_lbs: p.data.bodyweightLbs,
    fatigue: p.data.fatigue, soreness: p.data.soreness,
    confidence: p.data.confidence, motivation: p.data.motivation,
    meet_readiness: p.data.meetReadiness ?? null,
    pain_notes: p.data.painNotes ?? null,
    comments: p.data.comments ?? null,
  };

  if (existing) {
    const { error } = await supabase.from('check_ins').update(payload).eq('id', existing.id);
    if (error) return mask('update', error);
    checkInBreadcrumb('checkin.updated', { check_in_id: existing.id, week_starting: weekStarting });
    return { ok: true as const, checkInId: existing.id };
  } else {
    const { data, error } = await supabase.from('check_ins').insert(payload).select('id').single();
    if (error || !data) return mask('insert', error ?? { message: 'no row' });
    checkInBreadcrumb('checkin.submitted', { check_in_id: data.id, week_starting: weekStarting });
    return { ok: true as const, checkInId: data.id };
  }
}
