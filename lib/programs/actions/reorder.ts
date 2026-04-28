'use server';

import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { reorderSchema } from '../schemas';
import { getCurrentCoach } from '../get-current-coach';
import { programBreadcrumb } from '../breadcrumbs';

const GENERIC_DB_ERROR = 'Failed to reorder. Please try again.';

function maskDbError(operation: string, error: { message: string }) {
  Sentry.captureException(new Error(`reorder.${operation}: ${error.message}`));
  return { ok: false as const, reason: 'db_error' as const, message: GENERIC_DB_ERROR };
}

/**
 * Move a program_exercise row up or down within its day.
 * Strategy: find neighbor by adjacent position, swap positions via
 * a temporary negative value to avoid the unique-index collision on
 * (program_day_id, position).
 */
export async function reorderProgramExercise(input: unknown) {
  const p = reorderSchema.safeParse(input);
  if (!p.success) return { ok: false as const, reason: 'invalid' as const, message: p.error.message };
  await getCurrentCoach();
  const supabase = await createClient();

  const { data: row, error: rErr } = await supabase.from('program_exercises')
    .select('id, position, program_day_id, program_days(program_id)')
    .eq('id', p.data.id).maybeSingle();
  if (rErr) return maskDbError('exercise_lookup', rErr);
  if (!row) return { ok: false as const, reason: 'not_found' as const, message: 'exercise not found' };
  const programId = (row.program_days as unknown as { program_id: string }).program_id;

  const op = p.data.direction === 'up' ? '<' : '>';
  const order = p.data.direction === 'up' ? { ascending: false } : { ascending: true };
  const { data: neighbor, error: nErr } = await supabase.from('program_exercises')
    .select('id, position').eq('program_day_id', row.program_day_id)
    .filter('position', op, row.position)
    .order('position', order).limit(1).maybeSingle();
  if (nErr) return maskDbError('exercise_neighbor_lookup', nErr);
  if (!neighbor) return { ok: true as const, noop: true, programId };

  // Swap via temp negative position to avoid uniq-constraint conflict.
  const tmp = -row.position - 1;
  const r1 = await supabase.from('program_exercises').update({ position: tmp }).eq('id', row.id);
  if (r1.error) return maskDbError('exercise_swap_1', r1.error);
  const r2 = await supabase.from('program_exercises').update({ position: row.position }).eq('id', neighbor.id);
  if (r2.error) return maskDbError('exercise_swap_2', r2.error);
  const r3 = await supabase.from('program_exercises').update({ position: neighbor.position }).eq('id', row.id);
  if (r3.error) return maskDbError('exercise_swap_3', r3.error);

  // Bump program version.
  await supabase.from('programs')
    .update({ version: p.data.programVersion + 1 })
    .eq('id', programId).eq('version', p.data.programVersion);

  programBreadcrumb('program.edited', { program_id: programId, action: 'reorder_exercise', target_id: row.id });
  return { ok: true as const, programId };
}

export async function reorderProgramDay(input: unknown) {
  const p = reorderSchema.safeParse(input);
  if (!p.success) return { ok: false as const, reason: 'invalid' as const, message: p.error.message };
  await getCurrentCoach();
  const supabase = await createClient();

  const { data: row, error: rErr } = await supabase.from('program_days')
    .select('id, week_number, day_number, program_id').eq('id', p.data.id).maybeSingle();
  if (rErr) return maskDbError('day_lookup', rErr);
  if (!row) return { ok: false as const, reason: 'not_found' as const, message: 'day not found' };

  const op = p.data.direction === 'up' ? '<' : '>';
  const order = p.data.direction === 'up' ? { ascending: false } : { ascending: true };
  const { data: neighbor, error: nErr } = await supabase.from('program_days')
    .select('id, day_number').eq('program_id', row.program_id).eq('week_number', row.week_number)
    .filter('day_number', op, row.day_number)
    .order('day_number', order).limit(1).maybeSingle();
  if (nErr) return maskDbError('day_neighbor_lookup', nErr);
  if (!neighbor) return { ok: true as const, noop: true, programId: row.program_id };

  const tmp = -row.day_number - 1;
  const r1 = await supabase.from('program_days').update({ day_number: tmp }).eq('id', row.id);
  if (r1.error) return maskDbError('day_swap_1', r1.error);
  const r2 = await supabase.from('program_days').update({ day_number: row.day_number }).eq('id', neighbor.id);
  if (r2.error) return maskDbError('day_swap_2', r2.error);
  const r3 = await supabase.from('program_days').update({ day_number: neighbor.day_number }).eq('id', row.id);
  if (r3.error) return maskDbError('day_swap_3', r3.error);

  await supabase.from('programs')
    .update({ version: p.data.programVersion + 1 })
    .eq('id', row.program_id).eq('version', p.data.programVersion);

  programBreadcrumb('program.edited', { program_id: row.program_id, action: 'reorder_day', target_id: row.id });
  return { ok: true as const, programId: row.program_id };
}
