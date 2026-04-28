'use server';

import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { getCurrentCoach } from '../get-current-coach';
import {
  saveProgramHeaderSchema, saveProgramDaySchema, saveProgramExerciseSchema,
  addProgramDaySchema, addProgramExerciseSchema,
  removeProgramDaySchema, removeProgramExerciseSchema,
} from '../schemas';
import { programBreadcrumb, captureVersionConflict } from '../breadcrumbs';

const GENERIC_DB_ERROR = 'Failed to save. Please try again.';

type Result<T> =
  | { ok: true; data: T; newVersion: number }
  | { ok: false; reason: 'invalid' | 'conflict' | 'not_found' | 'db_error'; message: string };

function maskDbError(operation: string, error: { message: string }): { ok: false; reason: 'db_error'; message: string } {
  Sentry.captureException(new Error(`saveProgram.${operation}: ${error.message}`));
  return { ok: false, reason: 'db_error', message: GENERIC_DB_ERROR };
}

async function bumpVersion(programId: string, expectedVersion: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('programs').update({ version: expectedVersion + 1 })
    .eq('id', programId).eq('version', expectedVersion)
    .select('id, version').maybeSingle();
  if (error) {
    Sentry.captureException(new Error(`saveProgram.bumpVersion: ${error.message}`));
    return { ok: false as const, reason: 'db_error' as const, message: GENERIC_DB_ERROR };
  }
  if (!data) {
    const { data: cur } = await supabase.from('programs').select('version').eq('id', programId).maybeSingle();
    captureVersionConflict({
      program_id: programId, expected_version: expectedVersion, actual_version: cur?.version ?? -1,
    });
    return { ok: false as const, reason: 'conflict' as const, message: 'program version mismatch' };
  }
  return { ok: true as const, newVersion: data.version };
}

export async function saveProgramHeader(input: unknown): Promise<Result<{ programId: string }>> {
  const p = saveProgramHeaderSchema.safeParse(input);
  if (!p.success) return { ok: false, reason: 'invalid', message: p.error.message };
  await getCurrentCoach();
  const supabase = await createClient();
  const bump = await bumpVersion(p.data.programId, p.data.programVersion);
  if (!bump.ok) return bump;

  const { error } = await supabase.from('programs').update({
    name: p.data.name,
    block_type: p.data.blockType,
    total_weeks: p.data.totalWeeks,
    start_date: p.data.startDate ?? null,
    end_date: p.data.endDate ?? null,
    notes: p.data.notes ?? null,
  }).eq('id', p.data.programId);
  if (error) return maskDbError('header_update', error);

  programBreadcrumb('program.edited', { program_id: p.data.programId, action: 'header' });
  return { ok: true, data: { programId: p.data.programId }, newVersion: bump.newVersion };
}

export async function saveProgramDay(input: unknown): Promise<Result<{ programDayId: string }>> {
  const p = saveProgramDaySchema.safeParse(input);
  if (!p.success) return { ok: false, reason: 'invalid', message: p.error.message };
  await getCurrentCoach();
  const supabase = await createClient();

  const { data: dayRow } = await supabase
    .from('program_days').select('program_id').eq('id', p.data.programDayId).maybeSingle();
  if (!dayRow) return { ok: false, reason: 'not_found', message: 'day not found' };
  const bump = await bumpVersion(dayRow.program_id, p.data.programVersion);
  if (!bump.ok) return bump;

  const { error } = await supabase.from('program_days').update({
    week_number: p.data.weekNumber, day_number: p.data.dayNumber,
    name: p.data.name, notes: p.data.notes ?? null,
  }).eq('id', p.data.programDayId);
  if (error) return maskDbError('day_update', error);

  programBreadcrumb('program.edited', { program_id: dayRow.program_id, action: 'day', target_id: p.data.programDayId });
  return { ok: true, data: { programDayId: p.data.programDayId }, newVersion: bump.newVersion };
}

export async function saveProgramExercise(input: unknown): Promise<Result<{ programExerciseId: string }>> {
  const p = saveProgramExerciseSchema.safeParse(input);
  if (!p.success) return { ok: false, reason: 'invalid', message: p.error.message };
  await getCurrentCoach();
  const supabase = await createClient();

  const { data: exRow } = await supabase
    .from('program_exercises')
    .select('program_day_id, program_days(program_id)')
    .eq('id', p.data.programExerciseId)
    .maybeSingle();
  if (!exRow) return { ok: false, reason: 'not_found', message: 'exercise not found' };
  const programId = (exRow.program_days as unknown as { program_id: string }).program_id;
  const bump = await bumpVersion(programId, p.data.programVersion);
  if (!bump.ok) return bump;

  const { error } = await supabase.from('program_exercises').update({
    name: p.data.name, sets: p.data.sets, reps: p.data.reps,
    load_pct: p.data.loadPct ?? null, load_lbs: p.data.loadLbs ?? null,
    rpe: p.data.rpe ?? null, group_label: p.data.groupLabel ?? null,
    notes: p.data.notes ?? null,
  }).eq('id', p.data.programExerciseId);
  if (error) return maskDbError('exercise_update', error);

  programBreadcrumb('program.edited', { program_id: programId, action: 'exercise', target_id: p.data.programExerciseId });
  return { ok: true, data: { programExerciseId: p.data.programExerciseId }, newVersion: bump.newVersion };
}

export async function addProgramDay(input: unknown): Promise<Result<{ programDayId: string }>> {
  const p = addProgramDaySchema.safeParse(input);
  if (!p.success) return { ok: false, reason: 'invalid', message: p.error.message };
  await getCurrentCoach();
  const supabase = await createClient();
  const bump = await bumpVersion(p.data.programId, p.data.programVersion);
  if (!bump.ok) return bump;

  const { data: maxRow } = await supabase
    .from('program_days')
    .select('day_number')
    .eq('program_id', p.data.programId)
    .eq('week_number', p.data.weekNumber)
    .order('day_number', { ascending: false }).limit(1).maybeSingle();
  const nextDay = (maxRow?.day_number ?? 0) + 1;

  const { data, error } = await supabase.from('program_days').insert({
    program_id: p.data.programId, week_number: p.data.weekNumber,
    day_number: nextDay, name: `Day ${nextDay}`,
  }).select('id').single();
  if (error || !data) return maskDbError('add_day', error ?? { message: 'no row' });

  programBreadcrumb('program.edited', { program_id: p.data.programId, action: 'add_day', target_id: data.id });
  return { ok: true, data: { programDayId: data.id }, newVersion: bump.newVersion };
}

export async function addProgramExercise(input: unknown): Promise<Result<{ programExerciseId: string }>> {
  const p = addProgramExerciseSchema.safeParse(input);
  if (!p.success) return { ok: false, reason: 'invalid', message: p.error.message };
  await getCurrentCoach();
  const supabase = await createClient();

  const { data: dayRow } = await supabase
    .from('program_days').select('program_id').eq('id', p.data.programDayId).maybeSingle();
  if (!dayRow) return { ok: false, reason: 'not_found', message: 'day not found' };
  const bump = await bumpVersion(dayRow.program_id, p.data.programVersion);
  if (!bump.ok) return bump;

  const { data: maxRow } = await supabase
    .from('program_exercises').select('position')
    .eq('program_day_id', p.data.programDayId)
    .order('position', { ascending: false }).limit(1).maybeSingle();
  const nextPosition = (maxRow?.position ?? 0) + 1;

  const { data, error } = await supabase.from('program_exercises').insert({
    program_day_id: p.data.programDayId, position: nextPosition,
    name: 'New exercise', sets: 3, reps: '5',
  }).select('id').single();
  if (error || !data) return maskDbError('add_exercise', error ?? { message: 'no row' });

  programBreadcrumb('program.edited', { program_id: dayRow.program_id, action: 'add_exercise', target_id: data.id });
  return { ok: true, data: { programExerciseId: data.id }, newVersion: bump.newVersion };
}

export async function removeProgramDay(input: unknown): Promise<Result<{ removed: true }>> {
  const p = removeProgramDaySchema.safeParse(input);
  if (!p.success) return { ok: false, reason: 'invalid', message: p.error.message };
  await getCurrentCoach();
  const supabase = await createClient();

  const { data: dayRow } = await supabase
    .from('program_days').select('program_id').eq('id', p.data.programDayId).maybeSingle();
  if (!dayRow) return { ok: false, reason: 'not_found', message: 'day not found' };
  const bump = await bumpVersion(dayRow.program_id, p.data.programVersion);
  if (!bump.ok) return bump;

  const { error } = await supabase.from('program_days').delete().eq('id', p.data.programDayId);
  if (error) return maskDbError('remove_day', error);

  programBreadcrumb('program.edited', { program_id: dayRow.program_id, action: 'remove_day', target_id: p.data.programDayId });
  return { ok: true, data: { removed: true }, newVersion: bump.newVersion };
}

export async function removeProgramExercise(input: unknown): Promise<Result<{ removed: true }>> {
  const p = removeProgramExerciseSchema.safeParse(input);
  if (!p.success) return { ok: false, reason: 'invalid', message: p.error.message };
  await getCurrentCoach();
  const supabase = await createClient();

  const { data: exRow } = await supabase
    .from('program_exercises')
    .select('program_day_id, program_days(program_id)')
    .eq('id', p.data.programExerciseId).maybeSingle();
  if (!exRow) return { ok: false, reason: 'not_found', message: 'exercise not found' };
  const programId = (exRow.program_days as unknown as { program_id: string }).program_id;
  const bump = await bumpVersion(programId, p.data.programVersion);
  if (!bump.ok) return bump;

  const { error } = await supabase.from('program_exercises').delete().eq('id', p.data.programExerciseId);
  if (error) return maskDbError('remove_exercise', error);

  programBreadcrumb('program.edited', { program_id: programId, action: 'remove_exercise', target_id: p.data.programExerciseId });
  return { ok: true, data: { removed: true }, newVersion: bump.newVersion };
}
