'use server';

import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { createProgramSchema, type CreateProgramInput } from '../schemas';
import { getCurrentCoach } from '../get-current-coach';
import { programBreadcrumb } from '../breadcrumbs';
import { buildDeepCopyPayload } from '../duplicate';

export type CreateProgramResult =
  | { ok: true; programId: string }
  | { ok: false; reason: 'invalid' | 'source_not_found' | 'db_error'; message: string };

const GENERIC_DB_ERROR = 'Failed to save program. Please try again.';

function logAndMaskDbError(operation: string, error: { message: string }): { ok: false; reason: 'db_error'; message: string } {
  Sentry.captureException(new Error(`createProgram.${operation}: ${error.message}`));
  return { ok: false, reason: 'db_error', message: GENERIC_DB_ERROR };
}

export async function createProgram(input: unknown): Promise<CreateProgramResult> {
  const parsed = createProgramSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: 'invalid', message: parsed.error.issues.map((i) => i.message).join('; ') };
  }
  const args: CreateProgramInput = parsed.data;
  const coach = await getCurrentCoach();
  const supabase = await createClient();

  if (args.mode === 'blank') {
    const { data: program, error } = await supabase.from('programs').insert({
      coach_id: coach.id,
      athlete_id: args.athleteId ?? null,
      name: args.name,
      block_type: args.blockType,
      total_weeks: args.totalWeeks,
      notes: args.notes ?? null,
      is_template: args.isTemplate,
      start_date: args.startDate ?? null,
      end_date: args.startDate ? deriveEndDate(args.startDate, args.totalWeeks) : null,
    }).select('id').single();
    if (error || !program) {
      return logAndMaskDbError('blank_insert', error ?? { message: 'no row returned' });
    }
    programBreadcrumb('program.created', { program_id: program.id, mode: 'blank', is_template: args.isTemplate });
    return { ok: true, programId: program.id };
  }

  // duplicate_template OR duplicate_program: deep-copy.
  const sourceId = args.sourceProgramId;
  const { data: source, error: srcErr } = await supabase
    .from('programs')
    .select('*')
    .eq('id', sourceId)
    .maybeSingle();
  if (srcErr) return logAndMaskDbError('source_lookup', srcErr);
  if (!source) return { ok: false, reason: 'source_not_found', message: 'source program not found or not accessible' };

  const { data: srcDays = [], error: dErr } = await supabase
    .from('program_days').select('*').eq('program_id', sourceId);
  if (dErr) return logAndMaskDbError('days_lookup', dErr);

  const dayIds = (srcDays ?? []).map((d) => d.id);
  let srcExercises: typeof srcDays = [];
  if (dayIds.length > 0) {
    const { data, error: eErr } = await supabase
      .from('program_exercises').select('*').in('program_day_id', dayIds);
    if (eErr) return logAndMaskDbError('exercises_lookup', eErr);
    srcExercises = data ?? [];
  }

  const payload = buildDeepCopyPayload(
    source as unknown as Parameters<typeof buildDeepCopyPayload>[0],
    (srcDays ?? []) as unknown as Parameters<typeof buildDeepCopyPayload>[1],
    srcExercises as unknown as Parameters<typeof buildDeepCopyPayload>[2],
    { coachId: coach.id, isTemplate: false },
  );

  const { error: pi } = await supabase.from('programs').insert({
    id: payload.program.id,
    coach_id: payload.program.coach_id,
    athlete_id: payload.program.athlete_id,
    name: payload.program.name,
    block_type: payload.program.block_type,
    total_weeks: payload.program.total_weeks,
    notes: payload.program.notes,
    start_date: payload.program.start_date,
    end_date: payload.program.end_date,
    is_template: payload.program.is_template,
    is_active: true,
    version: 1,
  });
  if (pi) return logAndMaskDbError('program_insert', pi);

  if (payload.days.length > 0) {
    const { error: di } = await supabase.from('program_days').insert(payload.days);
    if (di) {
      // Best-effort cleanup: drop the orphan program. Postgres will cascade
      // any partial children. If cleanup fails, the program is left as
      // is_active=false to hide from default views.
      const cleanup = await supabase.from('programs').delete().eq('id', payload.program.id);
      if (cleanup.error) {
        await supabase.from('programs').update({ is_active: false }).eq('id', payload.program.id);
      }
      return logAndMaskDbError('days_insert', di);
    }
  }
  if (payload.exercises.length > 0) {
    const { error: ei } = await supabase.from('program_exercises').insert(payload.exercises);
    if (ei) {
      const cleanup = await supabase.from('programs').delete().eq('id', payload.program.id);
      if (cleanup.error) {
        await supabase.from('programs').update({ is_active: false }).eq('id', payload.program.id);
      }
      return logAndMaskDbError('exercises_insert', ei);
    }
  }

  programBreadcrumb('program.created', {
    program_id: payload.program.id, mode: args.mode, source_id: sourceId,
  });
  return { ok: true, programId: payload.program.id };
}

function deriveEndDate(startDate: string, totalWeeks: number): string {
  const d = new Date(`${startDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + totalWeeks * 7 - 1);
  return d.toISOString().slice(0, 10);
}
