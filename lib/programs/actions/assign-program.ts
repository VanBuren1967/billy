'use server';

import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { assignProgramSchema } from '../schemas';
import { getCurrentCoach } from '../get-current-coach';
import { programBreadcrumb } from '../breadcrumbs';
import { buildDeepCopyPayload } from '../duplicate';

const GENERIC_DB_ERROR = 'Failed to assign program. Please try again.';

function maskDbError(operation: string, error: { message: string }) {
  Sentry.captureException(new Error(`assignProgramToAthlete.${operation}: ${error.message}`));
  return { ok: false as const, reason: 'db_error' as const, message: GENERIC_DB_ERROR };
}

export async function assignProgramToAthlete(input: unknown) {
  const p = assignProgramSchema.safeParse(input);
  if (!p.success) return { ok: false as const, reason: 'invalid' as const, message: p.error.message };
  const coach = await getCurrentCoach();
  const supabase = await createClient();

  const { data: tpl } = await supabase.from('programs').select('*')
    .eq('id', p.data.templateProgramId).maybeSingle();
  if (!tpl) return { ok: false as const, reason: 'not_found' as const, message: 'template not accessible' };
  if (tpl.coach_id !== coach.id) return { ok: false as const, reason: 'forbidden' as const, message: 'cross-coach assign' };

  const { data: ath } = await supabase.from('athletes').select('id, coach_id, name')
    .eq('id', p.data.athleteId).maybeSingle();
  if (!ath || ath.coach_id !== coach.id) return { ok: false as const, reason: 'not_found' as const, message: 'athlete not in roster' };

  const { data: srcDays = [] } = await supabase.from('program_days').select('*').eq('program_id', tpl.id);
  const dayIds = (srcDays ?? []).map((d) => d.id);
  let srcExercises: typeof srcDays = [];
  if (dayIds.length > 0) {
    const { data } = await supabase.from('program_exercises').select('*').in('program_day_id', dayIds);
    srcExercises = data ?? [];
  }

  const endDate = deriveEndDate(p.data.startDate, tpl.total_weeks);
  const payload = buildDeepCopyPayload(
    tpl as unknown as Parameters<typeof buildDeepCopyPayload>[0],
    (srcDays ?? []) as unknown as Parameters<typeof buildDeepCopyPayload>[1],
    srcExercises as unknown as Parameters<typeof buildDeepCopyPayload>[2],
    {
      coachId: coach.id, athleteId: p.data.athleteId, isTemplate: false,
      startDate: p.data.startDate, endDate, name: `${tpl.name} — ${ath.name}`,
    },
  );

  const { error: pi } = await supabase.from('programs').insert({
    id: payload.program.id, coach_id: payload.program.coach_id,
    athlete_id: payload.program.athlete_id, name: payload.program.name,
    block_type: payload.program.block_type, total_weeks: payload.program.total_weeks,
    notes: payload.program.notes, start_date: payload.program.start_date,
    end_date: payload.program.end_date, is_template: false, is_active: true, version: 1,
  });
  if (pi) return maskDbError('program_insert', pi);

  if (payload.days.length > 0) {
    const { error: di } = await supabase.from('program_days').insert(payload.days);
    if (di) {
      const cleanup = await supabase.from('programs').delete().eq('id', payload.program.id);
      if (cleanup.error) {
        await supabase.from('programs').update({ is_active: false }).eq('id', payload.program.id);
      }
      return maskDbError('days_insert', di);
    }
  }
  if (payload.exercises.length > 0) {
    const { error: ei } = await supabase.from('program_exercises').insert(payload.exercises);
    if (ei) {
      const cleanup = await supabase.from('programs').delete().eq('id', payload.program.id);
      if (cleanup.error) {
        await supabase.from('programs').update({ is_active: false }).eq('id', payload.program.id);
      }
      return maskDbError('exercises_insert', ei);
    }
  }

  programBreadcrumb('program.assigned', {
    template_id: tpl.id, new_program_id: payload.program.id, athlete_id: p.data.athleteId,
  });
  return { ok: true as const, newProgramId: payload.program.id };
}

function deriveEndDate(startDate: string, totalWeeks: number): string {
  const d = new Date(`${startDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + totalWeeks * 7 - 1);
  return d.toISOString().slice(0, 10);
}
